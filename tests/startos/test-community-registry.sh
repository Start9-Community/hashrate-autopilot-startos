#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

required_files=(
    .github/workflows/build.yml
    .github/workflows/tagAndRelease.yml
    .github/workflows/release.yml
    package-lock.json
    startos/versions/current.ts
    startos/versions/index.ts
)
for path in "${required_files[@]}"; do
    test -f "$path" || { echo "missing required file: $path" >&2; exit 1; }
done

grep -Fq "version: '1.17.4:0'" startos/versions/current.ts
grep -Fq "include node_modules/@start9labs/start-sdk/s9pk.mk" Makefile
test ! -e s9pk.mk
test "$(node -p "require('./package.json').dependencies['@start9labs/start-sdk']")" = "2.0.9"

if rg -n '(^|[^[:alnum:]])v?[0-9]+\.[0-9]+\.[0-9]+' README.md instructions.md; then
    echo "README.md and instructions.md must not carry release versions" >&2
    exit 1
fi

grep -Fq "contains(github.ref_name, '_')" .github/workflows/docker-publish.yml
grep -Fq "'v*_*'" .github/workflows/release.yml
