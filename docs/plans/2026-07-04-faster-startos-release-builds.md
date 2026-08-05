# Faster StartOS Release Builds Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce local StartOS `.s9pk` release build time and add a GitHub Actions artifact-build path without changing the existing GHCR/Umbrel image workflow.

**Architecture:** Keep the current root `Dockerfile` for Docker image publishing. Add a StartOS-specific packaging path that builds architecture-independent app outputs once, then packages x86_64 and aarch64 `.s9pk` artifacts from those outputs. After the local path is stable, add a CI workflow that can build, checksum, and upload the same artifacts for release publishing.

**Tech Stack:** StartOS SDK manifest, `start-cli s9pk pack`, Docker Buildx, pnpm workspaces, TypeScript, Vite, Lingui, GitHub Actions, GitHub CLI release flow.

---

## Current Bottleneck

The release profile runs:

```bash
pnpm install --frozen-lockfile && pnpm run check
make clean && make x86 && make arm
```

`make x86` and `make arm` both call `start-cli s9pk pack --arch=<arch>`, which builds the configured Dockerfile for each target architecture. The root `Dockerfile` runs `pnpm install --frozen-lockfile` and `pnpm build` inside each image build. That means TypeScript, Lingui, Vite, and daemon compilation run twice, and the aarch64 copy runs under QEMU.

The release build should preserve architecture-specific native runtime dependencies, especially `better-sqlite3`, while moving architecture-independent app compilation out of the per-arch Docker build. The host-side prebuild must still be a clean-room build: it cannot copy stale `dist` output from a long-lived working tree into a release image.

Before committing any behavior-changing task in this plan, apply the repo metadata rules from `CLAUDE.md`: add the same-commit `CHANGELOG.md` entry, and increment `BUILD_NUMBER` when the change affects dashboard or daemon runtime behavior. The commit snippets include these files so they are not missed.

---

## Task 1: Capture Baseline Timings

**Files:**
- Create: `docs/release-build-performance.md`

**Step 1: Record current command timings**

Run each command from the repository root. `make x86` and `make arm` create the `.s9pk` files inspected in the next step; do not rely on leftovers from a prior release build.

```bash
/usr/bin/time -p pnpm run check
/usr/bin/time -p make clean
/usr/bin/time -p make x86
/usr/bin/time -p make arm
```

Expected: all commands exit 0. Record real/user/sys times.

**Step 2: Inspect current package manifests**

Run:

```bash
start-cli s9pk inspect hashrate-autopilot-9_x86_64.s9pk manifest | jq '{id,title,version,gitHash,sdkVersion,arches: ([.images[].arch // []] | flatten | unique)}'
start-cli s9pk inspect hashrate-autopilot-9_aarch64.s9pk manifest | jq '{id,title,version,gitHash,sdkVersion,arches: ([.images[].arch // []] | flatten | unique)}'
```

Expected: both report the same app version and git hash, with `x86_64` and `aarch64` respectively.

**Step 3: Document baseline**

Create `docs/release-build-performance.md` with:

```markdown
# Release Build Performance

## Baseline

- Date:
- Commit:
- `pnpm run check`:
- `make x86`:
- `make arm`:

## Known Bottleneck

The StartOS package path currently compiles TypeScript, Lingui, Vite, and daemon output inside each architecture-specific Docker build. The aarch64 build runs those same architecture-independent steps under QEMU.
```

**Step 4: Commit**

```bash
git add docs/release-build-performance.md
git commit -m "docs: record StartOS release build baseline"
```

---

## Task 2: Add A Clean Release Input Prebuild Script

**Files:**
- Create: `scripts/build-release-inputs.sh`
- Modify: `package.json`
- Verify existing package scripts under `packages/*/package.json`

**Step 1: Create the script**

Create `scripts/build-release-inputs.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

app_version="$(sed -n "s/.*appVersion = '\([^']*\)'.*/\1/p" startos/utils.ts | head -1)"
if [ -z "$app_version" ]; then
    echo "Could not parse appVersion from startos/utils.ts" >&2
    exit 1
fi

git_sha="${GIT_SHA:-}"
if [ -z "$git_sha" ]; then
    git_sha="$(git rev-parse --short HEAD 2>/dev/null || true)"
fi
git_sha="${git_sha:-dev}"

# Prevent stale output contamination. The daemon build copies migrations
# into dist but does not delete removed or renamed migration files first.
rm -rf packages/*/dist javascript

export APP_VERSION="$app_version"
export GIT_SHA="$git_sha"

pnpm -r run build
pnpm run build:startos
```

Make it executable:

```bash
chmod +x scripts/build-release-inputs.sh
```

**Step 2: Add root script**

Add a root script:

```json
"build:release-inputs": "./scripts/build-release-inputs.sh"
```

This builds:

- workspace package `dist` outputs
- dashboard static assets
- daemon output and migrations
- StartOS `javascript/` bundle

The script exports `APP_VERSION` from `startos/utils.ts` before the dashboard host build. This preserves the StartOS version source of truth that previously reached Vite through the Docker build arg. Do not let the dashboard fall back to `rdouma-hashrate-autopilot/umbrel-app.yml` for StartOS package builds.

**Step 3: Verify cleanup is part of the build**

Run:

```bash
mkdir -p packages/daemon/dist/state/migrations
echo stale > packages/daemon/dist/state/migrations/stale-release-input-probe.sql
pnpm run build:release-inputs
test ! -e packages/daemon/dist/state/migrations/stale-release-input-probe.sql
```

Expected:

- `packages/bitcoind-client/dist` exists
- `packages/braiins-client/dist` exists
- `packages/shared/dist` exists
- `packages/dashboard/dist` exists
- `packages/daemon/dist/main.js` exists
- `javascript/index.js` exists
- the stale migration probe does not exist

**Step 4: Verify dashboard APP_VERSION is baked from StartOS metadata**

Run the normal version check:

```bash
app_version="$(sed -n "s/.*appVersion = '\([^']*\)'.*/\1/p" startos/utils.ts | head -1)"
rg -F "$app_version" packages/dashboard/dist/assets
```

Expected: at least one dashboard bundle asset contains the exact StartOS `appVersion`.

This non-sentinel check can false-positive on dependency text in a vendor bundle. Treat the sentinel check below as authoritative because the sentinel should not appear anywhere unless Vite received the StartOS version value.

Because the Umbrel and StartOS versions can temporarily match, also run this one-time sentinel check before committing. Run the block as one script, not line-by-line in an interactive shell, so the `trap` is installed, cleared, and cannot remain armed after the check:

```bash
sentinel="9.99.123-startos-sentinel"
cp startos/utils.ts /tmp/hashrate9-startos-utils.ts
trap 'cp /tmp/hashrate9-startos-utils.ts startos/utils.ts' EXIT
perl -0pi -e "s/appVersion = '[^']+'/appVersion = '$sentinel'/" startos/utils.ts
pnpm run build:release-inputs
rg -F "$sentinel" packages/dashboard/dist/assets
cp /tmp/hashrate9-startos-utils.ts startos/utils.ts
trap - EXIT
pnpm run build:release-inputs
```

Expected: the sentinel appears in a built dashboard asset, then `startos/utils.ts` is restored and the release inputs are rebuilt with the real version. Do not commit the sentinel version.

**Step 5: Commit**

```bash
git add package.json scripts/build-release-inputs.sh CHANGELOG.md
git commit -m "chore: add release input build script"
```

---

## Task 3: Add A StartOS-Specific Dockerfile

**Files:**
- Create: `Dockerfile.startos`
- Create: `Dockerfile.startos.dockerignore`
- Do not modify: `.dockerignore` unless Dockerfile-specific ignores are proven unsupported by `start-cli`

**Step 1: Create `Dockerfile.startos`**

Start with the same runtime behavior as the root Dockerfile, but assume app outputs are already built before `start-cli s9pk pack` runs.

Initial shape:

```dockerfile
# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app

ARG TARGETARCH
ARG APP_VERSION=unknown

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/braiins-client/package.json packages/braiins-client/
COPY packages/bitcoind-client/package.json packages/bitcoind-client/
COPY packages/daemon/package.json packages/daemon/
COPY packages/dashboard/package.json packages/dashboard/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm-startos-${TARGETARCH},target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod

COPY packages/bitcoind-client/dist packages/bitcoind-client/dist
COPY packages/braiins-client/dist packages/braiins-client/dist
COPY packages/shared/dist packages/shared/dist
COPY packages/daemon/dist packages/daemon/dist
COPY packages/dashboard/dist packages/dashboard/dist
COPY BUILD_NUMBER ./

RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3010/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=3010 \
    DB_PATH=/app/data/state.db \
    DASHBOARD_STATIC=packages/dashboard/dist

CMD ["node", "packages/daemon/dist/main.js"]
```

Keep `ARG APP_VERSION` and `ENV APP_VERSION=${APP_VERSION}` in this Dockerfile. The dashboard consumes `APP_VERSION` during the host prebuild in `scripts/build-release-inputs.sh`, while the daemon runtime also reads `process.env.APP_VERSION` for `/api/build` and `USER_AGENT`. `startos/manifest/index.ts` already passes `buildArgs: { APP_VERSION: appVersion }`, so the packaged image receives the StartOS version without adding a second source of truth.

Start without `python3 build-essential`. `better-sqlite3` publishes Linux x64/arm64 prebuilds, and avoiding the toolchain keeps the ARM QEMU install layer smaller. If either architecture fails because a native module must compile from source, add the toolchain back with a comment explaining the fallback.

**Step 2: Add Dockerfile-specific context rules**

Create `Dockerfile.startos.dockerignore` next to `Dockerfile.startos`. Use Dockerfile-specific ignore rules so the root `Dockerfile` and GHCR/Umbrel image workflow keep their existing clean-context behavior.

```dockerignore
*
!BUILD_NUMBER
!.npmrc
!package.json
!pnpm-lock.yaml
!pnpm-workspace.yaml
!packages/
!packages/bitcoind-client/
!packages/bitcoind-client/package.json
!packages/bitcoind-client/dist/
!packages/bitcoind-client/dist/**
!packages/braiins-client/
!packages/braiins-client/package.json
!packages/braiins-client/dist/
!packages/braiins-client/dist/**
!packages/shared/
!packages/shared/package.json
!packages/shared/dist/
!packages/shared/dist/**
!packages/daemon/
!packages/daemon/package.json
!packages/daemon/dist/
!packages/daemon/dist/**
!packages/dashboard/
!packages/dashboard/package.json
!packages/dashboard/dist/
!packages/dashboard/dist/**
```

Verify that `start-cli`'s Buildx invocation honors `Dockerfile.startos.dockerignore`. If it does not, use `.dockerignore` exceptions only as a fallback and add context-noise excludes so the root Dockerfile path is not contaminated by host `dist` outputs.

**Step 3: Build one local image directly**

Run:

```bash
pnpm run build:release-inputs
app_version="$(sed -n "s/.*appVersion = '\([^']*\)'.*/\1/p" startos/utils.ts | head -1)"
docker buildx build . -f ./Dockerfile.startos --platform=linux/amd64 --build-arg APP_VERSION="$app_version" --progress=plain --load -t hashrate9-startos:test-amd64
```

Expected:

- build exits 0
- Docker output does not run `pnpm -r run build`
- transferred build context stays small enough to show that the Dockerfile-specific ignore file is active

**Step 4: Smoke runtime imports**

Run:

```bash
docker run --rm --entrypoint node hashrate9-startos:test-amd64 -e "import('./packages/daemon/dist/main.js').then(() => console.log('daemon import ok'))"
```

Expected: `daemon import ok`, or the process starts the server without module resolution errors. If importing starts the daemon, use a narrower module import that exercises workspace package resolution.

**Step 5: Smoke aarch64 native runtime dependency**

Build and test the ARM runtime image:

```bash
app_version="$(sed -n "s/.*appVersion = '\([^']*\)'.*/\1/p" startos/utils.ts | head -1)"
docker buildx build . -f ./Dockerfile.startos --platform=linux/arm64 --build-arg APP_VERSION="$app_version" --progress=plain --load -t hashrate9-startos:test-arm64
docker run --platform linux/arm64 --rm --entrypoint node hashrate9-startos:test-arm64 -e "import('better-sqlite3').then(() => console.log('better-sqlite3 ok'))"
```

Expected: `better-sqlite3 ok`. This specifically catches architecture-wrong `node_modules` output.

**Step 6: Boot-level container smoke**

Run the image as a real daemon, seed setup if needed, and hit the public and authenticated endpoints:

```bash
set -euo pipefail

build_number="$(tr -d '\n' < BUILD_NUMBER)"
app_version="$(sed -n "s/.*appVersion = '\([^']*\)'.*/\1/p" startos/utils.ts | head -1)"
docker rm -f hashrate9-startos-smoke >/dev/null 2>&1 || true
docker run -d --name hashrate9-startos-smoke -p 3011:3010 hashrate9-startos:test-amd64

cleanup() {
  docker logs hashrate9-startos-smoke >/tmp/hashrate9-startos-smoke.log 2>&1 || true
  docker rm -f hashrate9-startos-smoke >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3011/api/health >/tmp/hashrate9-health.json; then
    break
  fi
  sleep 1
done

jq -e '.status == "ok" and (.mode == "NEEDS_SETUP" or .mode == "OPERATIONAL")' /tmp/hashrate9-health.json

if jq -e '.mode == "NEEDS_SETUP"' /tmp/hashrate9-health.json >/dev/null; then
  curl -fsS http://127.0.0.1:3011/api/setup-info >/tmp/hashrate9-setup-info.json
  jq -n --slurpfile info /tmp/hashrate9-setup-info.json '{
    config: ($info[0].defaults + {
      destination_pool_url: "stratum+tcp://datum.local:23334",
      destination_pool_worker_name: "bc1qexample.rig1",
      btc_payout_address: "bc1qexample"
    }),
    secrets: {
      braiins_owner_token: "owner-tok",
      dashboard_password: "pw-12345678"
    }
  }' >/tmp/hashrate9-setup.json
  curl -fsS -H 'content-type: application/json' --data @/tmp/hashrate9-setup.json http://127.0.0.1:3011/api/setup

  for _ in $(seq 1 60); do
    curl -fsS http://127.0.0.1:3011/api/health >/tmp/hashrate9-health.json || true
    if jq -e '.mode == "OPERATIONAL"' /tmp/hashrate9-health.json >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

jq -e '.mode == "OPERATIONAL"' /tmp/hashrate9-health.json
curl -fsS http://127.0.0.1:3011/ | rg '(<div id="root"|/assets/)'
curl -fsS -u "smoke:pw-12345678" http://127.0.0.1:3011/api/build >/tmp/hashrate9-build.json
jq -e --argjson build "$build_number" --arg version "$app_version" '.build == $build and .version == $version' /tmp/hashrate9-build.json
```

Expected:

- container starts and reaches `NEEDS_SETUP` or `OPERATIONAL`
- setup path can seed config/secrets if needed
- container reaches `OPERATIONAL`
- dashboard static HTML is served
- `/api/build` returns the real `BUILD_NUMBER` and StartOS `appVersion`
- the smoke log in `/tmp/hashrate9-startos-smoke.log` has no module resolution, SQLite, or static-file errors
- Braiins, bitcoind, and electrs auth/connection failures are expected in this smoke because it uses fake tokens and unreachable upstream endpoints; do not fail the step on those lines

**Step 7: Commit**

```bash
git add Dockerfile.startos Dockerfile.startos.dockerignore CHANGELOG.md BUILD_NUMBER
git commit -m "build: add StartOS package Dockerfile"
```

---

## Task 4: Point StartOS Packaging At The New Dockerfile

**Files:**
- Modify: `startos/manifest/index.ts`

**Step 1: Change manifest dockerfile path**

Change:

```ts
dockerfile: './Dockerfile',
```

to:

```ts
dockerfile: './Dockerfile.startos',
```

Leave the root `Dockerfile` and `.github/workflows/docker-publish.yml` unchanged.

**Step 2: Rebuild StartOS JS**

Run:

```bash
pnpm run build:release-inputs
```

Expected: `javascript/index.js` is regenerated.

**Step 3: Build x86 package**

Run:

```bash
make clean
pnpm run build:release-inputs
make x86
```

Expected: `hashrate-autopilot-9_x86_64.s9pk` builds and manifest reports `x86_64`.

**Step 4: Build ARM package**

Run:

```bash
make arm
```

Expected: `hashrate-autopilot-9_aarch64.s9pk` builds and manifest reports `aarch64`. The build should not run the app TypeScript/Vite build under QEMU.

**Step 5: Commit**

```bash
git add startos/manifest/index.ts CHANGELOG.md BUILD_NUMBER
git commit -m "build: use optimized Dockerfile for StartOS packages"
```

---

## Task 5: Update Release Profile And Local Release Scripts

**Files:**
- Modify: `.github/release-profile.env`
- Inspect: `scripts/release-github.sh`
- Optional modify: `package.json`

**Step 1: Update release build command**

Change:

```bash
RELEASE_BUILD_COMMANDS="make clean && make x86 && make arm"
```

to:

```bash
RELEASE_BUILD_COMMANDS="make clean && pnpm run build:release-inputs && make x86 && make arm"
```

**Step 2: Run release dry build**

Run:

```bash
pnpm run release:artifacts
```

Expected:

- release checks pass
- x86 package builds
- ARM package builds
- artifacts listed:
  - `hashrate-autopilot-9_x86_64.s9pk`
  - `hashrate-autopilot-9_aarch64.s9pk`
  - `SHA256SUMS`

**Step 3: Verify packages**

Run:

```bash
pnpm run release:checksums
./scripts/release-github.sh verify --local
```

Expected: both `.s9pk` files verify against `SHA256SUMS`.

**Step 4: Optional package-script convenience**

If this workflow will be run often, add a package script:

```json
"release:verify": "./scripts/release-github.sh verify"
```

Then the verification command can be:

```bash
pnpm run release:verify -- --local
```

**Step 5: Commit**

```bash
git add .github/release-profile.env package.json CHANGELOG.md
git commit -m "build: prebuild StartOS release inputs"
```

---

## Task 6: Add GitHub Actions Artifact Build Workflow

**Files:**
- Create: `.github/workflows/startos-artifacts.yml`

**Step 1: Create workflow**

Use a manual workflow first. Do not auto-publish releases in this task.

```yaml
name: StartOS Artifacts

on:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: startos-artifacts-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Set up pnpm
        uses: pnpm/action-setup@v6

      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install start-cli
        run: |
          echo "Install start-cli here using the project-approved method."
          start-cli --version

      - name: Install StartOS developer key
        env:
          STARTOS_DEVELOPER_KEY_PEM: ${{ secrets.STARTOS_DEVELOPER_KEY_PEM }}
        run: |
          set -euo pipefail
          if [ -z "${STARTOS_DEVELOPER_KEY_PEM:-}" ]; then
            echo "STARTOS_DEVELOPER_KEY_PEM is required for release-grade signed .s9pk artifacts." >&2
            exit 1
          fi
          mkdir -p "$HOME/.startos"
          printf '%s\n' "$STARTOS_DEVELOPER_KEY_PEM" > "$HOME/.startos/developer.key.pem"
          chmod 600 "$HOME/.startos/developer.key.pem"

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v4

      - name: Set up Buildx
        uses: docker/setup-buildx-action@v4

      - name: Check
        run: pnpm run check

      - name: Build artifacts
        run: |
          make clean
          pnpm run build:release-inputs
          make x86
          make arm
          sha256sum hashrate-autopilot-9_x86_64.s9pk hashrate-autopilot-9_aarch64.s9pk > SHA256SUMS

      - name: Verify artifacts
        run: sha256sum -c SHA256SUMS

      - name: Upload artifacts
        uses: actions/upload-artifact@v7
        with:
          name: startos-artifacts
          path: |
            hashrate-autopilot-9_x86_64.s9pk
            hashrate-autopilot-9_aarch64.s9pk
            SHA256SUMS
```

These action tags were verified with `git ls-remote` during plan review:

- `actions/checkout@v7`
- `pnpm/action-setup@v6`
- `actions/setup-node@v6`
- `docker/setup-qemu-action@v4`
- `docker/setup-buildx-action@v4`
- `actions/upload-artifact@v7`

The `pnpm/action-setup` step intentionally runs before `actions/setup-node` cache resolution, so `setup-node` can locate `pnpm` for `cache: pnpm`.

**Step 2: Resolve start-cli install**

Find the supported noninteractive install path for `start-cli` and replace the placeholder. Verify the CLI version matches local expectations or document the difference.

**Step 3: Decide and configure signing**

Use a stable release signing key for CI:

- Store the release key PEM in GitHub secret `STARTOS_DEVELOPER_KEY_PEM`.
- Do not run `start-cli init-key` in CI.
- If CI artifacts are intended to checksum-match local artifacts, import the same release key into the local `~/.startos/developer.key.pem`.
- If CI uses a different key, document that CI-built `.s9pk` files are differently signed and `SHA256SUMS` only describes that CI artifact bundle.

Recommended default: use one stable release key for both local and CI release artifacts.

**Step 4: Run workflow manually**

Expected: workflow uploads all three artifacts. If `pnpm run check` fails because a Vitest path requires Playwright browsers on a clean runner, add the minimal `pnpm exec playwright install --with-deps` step needed by the failing test and rerun.

**Step 5: Commit**

```bash
git add .github/workflows/startos-artifacts.yml CHANGELOG.md
git commit -m "ci: build StartOS package artifacts"
```

---

## Task 7: Add Optional CI Artifact Release Path

**Files:**
- Modify or create: `docs/releasing-startos.md`
- Optional modify: `.github/workflows/startos-artifacts.yml`

**Step 1: Document local path**

Add:

```markdown
## Local StartOS Release Path

1. Run release preflight.
2. Run the artifact build script.
3. Run checksum generation.
4. Run local verification.
5. Run publish dry run.
6. Publish draft release.
7. Run download verification.
```

**Step 2: Document CI artifact path**

Add:

```markdown
## CI Artifact Path

1. Run the `StartOS Artifacts` workflow manually.
2. Download the workflow artifact bundle.
3. Verify `sha256sum -c SHA256SUMS`.
4. Inspect both `.s9pk` manifests.
5. Publish the draft GitHub release using the verified artifacts.
6. Run release download verification.
```

Also document signing:

- Release-grade CI artifacts require `STARTOS_DEVELOPER_KEY_PEM`.
- If CI and local builds use different signing keys, their `.s9pk` checksums will differ.
- `SHA256SUMS` verifies the artifact bundle it was generated with, not a separately signed rebuild.

**Step 3: Document expected warnings**

Add:

```markdown
Expected warnings:

- Generated Lingui catalog eslint warnings.
- Vite chunk-size and plugin timing warnings.
- StartOS dependency metadata warnings for `bitcoind`, `datum`, and `electrs`.
```

**Step 4: Commit**

```bash
git add docs/releasing-startos.md
git commit -m "docs: document StartOS release paths"
```

---

## Task 8: Final Verification

**Files:**
- No new files unless fixes are needed.

**Step 1: Run checks**

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
```

Expected:

- lint exits 0, with only known generated catalog warnings if still present
- typecheck exits 0
- tests pass
- build exits 0

**Step 2: Build and verify artifacts**

```bash
pnpm run release:artifacts
pnpm run release:checksums
./scripts/release-github.sh verify --local
```

Expected:

- x86 and ARM `.s9pk` files are present
- checksums pass
- manifests match expected version, git hash, SDK, and architecture

**Step 3: Compare timings**

Update `docs/release-build-performance.md` with optimized timings:

```markdown
## Optimized StartOS Path

- Date:
- Commit:
- `pnpm run build:release-inputs`:
- `make x86`:
- `make arm`:
- x86 runtime `pnpm install --prod` Docker layer:
- ARM runtime `pnpm install --prod` Docker layer:
- Net improvement:
```

If ARM CI still spends most of its time in QEMU after this change, plan a follow-up workflow split:

- x86 job on `ubuntu-latest` runs `make x86`
- ARM job on `ubuntu-24.04-arm` runs `make arm`
- fan-in job downloads both artifacts, creates `SHA256SUMS`, verifies checksums, and uploads the final bundle

Do not block this plan on that split; use the timing data above to decide whether native ARM CI is the next meaningful win.

**Step 4: Commit timing update**

```bash
git add docs/release-build-performance.md
git commit -m "docs: record optimized StartOS release timings"
```

---

## Acceptance Criteria

- Local ARM `.s9pk` packaging no longer runs TypeScript, Lingui, Vite, or daemon compilation under QEMU.
- `pnpm run build:release-inputs` deletes stale `dist` and `javascript` output before rebuilding.
- Dashboard release assets use `APP_VERSION` from `startos/utils.ts`, not Umbrel metadata fallback.
- The StartOS image sets runtime `APP_VERSION` from the manifest build arg, so `/api/build.version` and daemon `USER_AGENT` do not report `unknown`.
- StartOS packaging uses `Dockerfile.startos.dockerignore` without changing the shared `.dockerignore` path for the root Dockerfile.
- Local x86 and ARM packages inspect with the same app version and git hash.
- Boot-level smoke test proves `/api/health`, dashboard static serving, and authenticated `/api/build` build/version fields work from the optimized image.
- Runtime starts without workspace package resolution errors.
- Native runtime dependencies remain architecture-correct.
- CI release artifacts use a stable StartOS developer key from `STARTOS_DEVELOPER_KEY_PEM`, or docs explicitly mark them as differently signed non-matching bundles.
- Existing GHCR/Umbrel `Dockerfile` workflow remains unchanged.
- GitHub Actions can produce and upload `.s9pk` artifacts plus `SHA256SUMS`.
- Release docs describe both local and CI artifact paths.

---

## Risks And Checks

- `pnpm install --prod` may not preserve workspace links in the image. If this happens, switch this task to a `pnpm deploy`-based runtime bundle or install from packed workspace outputs.
- `Dockerfile.startos.dockerignore` may need parent directory exceptions for nested `dist` copies. Do not mutate the shared `.dockerignore` unless Dockerfile-specific ignore files are proven unsupported by `start-cli`'s Buildx invocation.
- `start-cli` availability in GitHub Actions must be pinned to a known install method and version.
- The optimized Dockerfile must not exclude files needed by runtime migrations, dashboard static assets, or package export maps.
- The runtime image may still include dashboard production dependencies that the daemon does not need. Accept that for the first optimization; a later `pnpm deploy --filter @hashrate-autopilot/daemon` pass can reduce image size after build time is improved.
