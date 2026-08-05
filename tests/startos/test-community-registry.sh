#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

fail() {
    printf 'FAIL: %s\n' "$*" >&2
    exit 1
}

assert_file() {
    local path="$1"
    test -f "$path" || fail "missing required file: $path"
}

assert_absent() {
    local path="$1"
    test ! -e "$path" || fail "unexpected legacy path exists: $path"
}

assert_active_line() {
    local path="$1"
    local pattern="$2"
    local message="$3"
    grep -Eq -- "$pattern" "$path" || fail "$message"
}

assert_equal() {
    local actual="$1"
    local expected="$2"
    local message="$3"
    test "$actual" = "$expected" || fail "$message (expected: $expected; actual: ${actual:-<missing>})"
}

assert_no_match() {
    local pattern="$1"
    local message="$2"
    shift 2

    local matches
    local status
    if matches="$(grep -En -- "$pattern" "$@")"; then
        fail "$message; matches: $matches"
    else
        status=$?
        test "$status" -eq 1 || fail "could not scan documentation for release versions"
    fi
}

required_files=(
    .github/workflows/build.yml
    .github/workflows/tagAndRelease.yml
    .github/workflows/release.yml
    package-lock.json
    startos/versions/current.ts
    startos/versions/index.ts
)
for path in "${required_files[@]}"; do
    assert_file "$path"
done

assert_absent .github/workflows/startos-artifacts.yml
assert_no_match \
    '^[[:space:]]*alerts[[:space:]]*:' \
    "SDK 2 manifest source must not declare the removed alerts field" \
    startos/manifest/index.ts
assert_no_match \
    '\.startos([/:]|$)' \
    "StartOS runtime source must not dial deprecated .startos service names" \
    startos/*.ts

bridge_resolver_count="$(grep -Ec '\.getBridgeAddress' startos/main.ts || true)"
assert_equal \
    "$bridge_resolver_count" \
    "3" \
    "startos/main.ts must resolve all three dependency bindings through the SDK"

assert_active_line \
    startos/versions/current.ts \
    "^[[:space:]]*version:[[:space:]]*'1\\.17\\.4:0'[[:space:]]*,?[[:space:]]*$" \
    "startos/versions/current.ts must set version to '1.17.4:0' on an active code line"
assert_active_line \
    Makefile \
    '^[[:space:]]*include[[:space:]]+node_modules/@start9labs/start-sdk/s9pk\.mk[[:space:]]*$' \
    "Makefile must include node_modules/@start9labs/start-sdk/s9pk.mk on an active line"
assert_absent s9pk.mk

if ! sdk_version="$(node -p "require('./package.json').dependencies?.['@start9labs/start-sdk'] ?? ''")"; then
    fail "could not read @start9labs/start-sdk from package.json dependencies"
fi
assert_equal \
    "$sdk_version" \
    "2.0.9" \
    "package.json dependencies must pin @start9labs/start-sdk"

release_version_pattern='(^|[^[:alnum:].])v?[0-9]+\.[0-9]+\.[0-9]+([^[:alnum:].]|$)'
assert_no_match \
    "$release_version_pattern" \
    "README.md and instructions.md must not carry release-version tokens" \
    README.md instructions.md

if ! docker_condition="$(node --input-type=module -e '
    import fs from "node:fs";
    import YAML from "yaml";

    const workflow = YAML.parse(fs.readFileSync(".github/workflows/docker-publish.yml", "utf8"));
    const condition = workflow.jobs?.build?.if;
    process.stdout.write(typeof condition === "string" ? condition : "");
')"; then
    fail "could not parse the Docker workflow with the yaml package"
fi
expected_docker_condition="\${{ !startsWith(github.ref, 'refs/tags/') || !contains(github.ref_name, '_') }}"
assert_equal \
    "$docker_condition" \
    "$expected_docker_condition" \
    "Docker workflow build job must use the exact StartOS tag guard"

if ! release_tags="$(node --input-type=module -e '
    import fs from "node:fs";
    import YAML from "yaml";

    const workflow = YAML.parse(fs.readFileSync(".github/workflows/release.yml", "utf8"));
    process.stdout.write(JSON.stringify(workflow.on?.push?.tags ?? null));
')"; then
    fail "could not parse the Community release workflow with the yaml package"
fi
assert_equal \
    "$release_tags" \
    '["v*_*"]' \
    "Community release workflow push tags must contain only v*_*"
