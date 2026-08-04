# StartOS Community Registry Preparation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge upstream Hashrate Autopilot `v1.17.4`, modernize the StartOS wrapper, and leave the public repository ready for Start9's initial Community Registry review.

**Architecture:** Continue from the isolated `sync-upstream-v1.17.1` worktree, preserve upstream history with a merge commit, and keep StartOS-specific behavior in the wrapper and packaging files. Adopt the current StartOS SDK, version layout, Makefile, and Community Registry workflow entry points while retaining the optimized two-architecture Docker packaging path. Make the monorepo reproducible under both Start9's `npm ci` automation and upstream's pnpm workflow.

**Tech Stack:** Git, TypeScript, pnpm and npm workspaces, StartOS SDK 2.x, `start-cli`, Docker Buildx, GitHub Actions, Bash, Vitest.

---

## Execution Rules

- Work only in `/home/missydog/Desktop/Learnding/Tools/Hashrate9/.worktrees/faster-startos-release-builds`.
- Use @sync-upstream-release for the merge, @test-driven-development for the submission contract and any behavior fixes, and @verification-before-completion before reporting success.
- Preserve the user's main worktree and unrelated branches.
- Never commit `.startos/`, signing keys, runtime databases, diagnostic credentials, logs, or generated `.s9pk` files.
- Do not push, publish, email Start9, create a GitHub release, or mutate a live Braiins bid.
- Keep LIVE mode disabled during any physical StartOS test.

### Task 1: Merge Upstream v1.17.4

**Files:**
- Merge upstream changes throughout the repository.
- Preserve downstream: `startos/**`, `Dockerfile.startos`, `Dockerfile.startos.dockerignore`, `Makefile`, `s9pk.mk`, `instructions.md`, and StartOS-specific docs/workflows pending later tasks.
- Review conflicts in: `README.md`, `CHANGELOG.md`, `.gitignore`, `docs/architecture.md`, and `docs/spec.md`.

**Step 1: Confirm the isolated baseline**

Run:

```bash
git status --short --branch
git merge-base --is-ancestor v1.17.1 HEAD
git rev-parse --verify refs/tags/v1.17.4
test "$(git rev-parse 'refs/tags/v1.17.4^{}')" = dcd98b1d6dca8922a91fa1c939831ed19e7455b3
test "$(git show-ref --hash refs/tags/v1.17.4)" = "$(git ls-remote upstream refs/tags/v1.17.4 | awk '{print $1}')"
test "$(git rev-parse 'refs/tags/v1.17.4^{}')" = "$(git ls-remote upstream 'refs/tags/v1.17.4^{}' | awk '{print $1}')"
```

Expected: clean `sync-upstream-v1.17.1`; the ancestry and tag-reference checks exit 0; the local annotated-tag
object and peeled commit match upstream, and the peeled commit is
`dcd98b1d6dca8922a91fa1c939831ed19e7455b3`.

**Step 2: Rename the integration branch**

Run:

```bash
git branch -m sync-upstream-v1.17.4
```

Expected: `git branch --show-current` prints `sync-upstream-v1.17.4`.

**Step 3: Merge with history preserved**

Run:

```bash
git merge --no-ff v1.17.4
```

Expected: a merge commit, or conflicts limited to files changed by both upstream and the downstream fork.

**Step 4: Resolve conflicts by ownership**

Take upstream application code, tests, migrations, release assets, FAQ content, and upstream behavior docs. Preserve the downstream StartOS package README intent, StartOS packaging notes, and wrapper/build files. For `CHANGELOG.md`, retain both histories in newest-first order.

Run after resolving:

```bash
git add <resolved-files>
git commit
```

Expected: the merge commit records both parents.

**Step 5: Verify the merge**

Run:

```bash
git merge-base --is-ancestor v1.17.4 HEAD
git log -1 --format='%P'
git diff --check HEAD^
pnpm test
```

Expected: upstream is an ancestor, the merge has two parents, no whitespace errors, and the full baseline suite passes.

### Task 2: Add a Failing Community-Submission Contract Test

**Files:**
- Create: `tests/startos/test-community-registry.sh`
- Modify: `package.json`

**Step 1: Write the repository contract test**

Create an executable Bash test that fails unless all of these are true:

```bash
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
```

Add to the root scripts:

```json
"check:startos-submission": "bash tests/startos/test-community-registry.sh"
```

**Step 2: Make the test executable**

Run:

```bash
chmod +x tests/startos/test-community-registry.sh
```

**Step 3: Verify RED**

Run:

```bash
pnpm run check:startos-submission
```

Expected: FAIL first on a missing Community Registry workflow or canonical version file.

**Step 4: Commit the failing contract**

Run:

```bash
git add tests/startos/test-community-registry.sh package.json
git commit -m "test: define Community Registry submission contract"
```

### Task 3: Add npm Workspace Compatibility and Upgrade the SDK

**Files:**
- Modify: `package.json`
- Modify: `packages/braiins-client/package.json`
- Modify: `packages/daemon/package.json`
- Modify: `packages/dashboard/package.json`
- Modify: `scripts/build-release-inputs.sh`
- Modify: `pnpm-lock.yaml`
- Create: `package-lock.json`

**Step 1: Make the root workspace visible to npm**

Add to `package.json`:

```json
"workspaces": [
  "packages/*"
]
```

Move `@start9labs/start-sdk` from `devDependencies` to `dependencies` at exact version `2.0.9`, and add:

```json
"overrides": {
  "@start9labs/start-sdk": "$@start9labs/start-sdk"
}
```

Replace every internal dependency range `workspace:*` with `*`. npm will link matching private workspaces, and pnpm will continue linking them from `pnpm-workspace.yaml`.

**Step 2: Remove nested reliance on a globally enabled pnpm shim**

Change root scripts to:

```json
"build": "./scripts/build-release-inputs.sh",
"build:workspace-libs": "npm run build --workspace @hashrate-autopilot/shared && npm run build --workspace @hashrate-autopilot/bitcoind-client && npm run build --workspace @hashrate-autopilot/braiins-client",
"prepare:checks": "npm run build:workspace-libs && npm run lingui:compile --workspace @hashrate-autopilot/dashboard",
"typecheck": "npm run prepare:checks && npm run typecheck --workspaces --if-present",
"test": "npm run prepare:checks && vitest run",
"check": "npm run lint && npm run typecheck && npm run test"
```

In `packages/dashboard/package.json`, change:

```json
"build": "npm run lingui:compile && tsc --noEmit && vite build"
```

**Step 3: Make the release-input build package-manager neutral**

Replace the final two commands in `scripts/build-release-inputs.sh` with explicit npm workspace builds:

```bash
npm run build --workspace @hashrate-autopilot/shared
npm run build --workspace @hashrate-autopilot/bitcoind-client
npm run build --workspace @hashrate-autopilot/braiins-client
npm run build --workspace @hashrate-autopilot/dashboard
npm run build --workspace @hashrate-autopilot/daemon
npm run build:startos
```

**Step 4: Regenerate both lockfiles**

Run:

```bash
pnpm install --lockfile-only
npm install --package-lock-only --ignore-scripts
```

Expected: both commands exit 0; `package-lock.json` records all five workspaces and StartOS SDK `2.0.9`.

**Step 5: Prove both clean install paths**

Run:

```bash
npm ci
npm run check
rm -rf node_modules packages/*/node_modules
pnpm install --frozen-lockfile
pnpm run check
```

Expected: both installers and both check runs pass. `node_modules` removal is limited to generated dependency directories in this isolated worktree.

**Step 6: Commit**

Run:

```bash
git add package.json packages/*/package.json scripts/build-release-inputs.sh package-lock.json pnpm-lock.yaml
git commit -m "build: support StartOS npm automation"
```

### Task 4: Adopt the Canonical StartOS Version Layout

**Files:**
- Create: `startos/versions/current.ts`
- Create: `startos/versions/index.ts`
- Modify: `startos/index.ts`
- Modify: `startos/utils.ts`
- Delete: `startos/install/versionGraph.ts`
- Delete: `startos/install/versions/index.ts`

**Step 1: Create the current version node**

Create `startos/versions/current.ts` using `VersionInfo.of` with:

```ts
version: '1.17.4:0'
```

Provide localized release notes that summarize the upstream payout-deduction fixes, persistent Electrum error handling, Timeline/P&L fixes, UI formatting polish, and FAQ addition, followed by the upstream release URL. Use a no-op upgrade migration and `IMPOSSIBLE` downgrade unless the SDK types require an equivalent explicit representation.

**Step 2: Create the minimal graph**

Create `startos/versions/index.ts`:

```ts
import { VersionGraph } from '@start9labs/start-sdk'
import { current } from './current'

export const versionGraph = VersionGraph.of({
  current,
  other: [],
})
```

An empty `other` array deliberately provides the SDK's generic `<=current` migration range; historical no-op nodes are not migration history.

**Step 3: Point the package entry point at the new graph**

Change `startos/index.ts` to import `versionGraph` from `./versions`.

**Step 4: Update the in-container application version**

Set in `startos/utils.ts`:

```ts
export const appVersion = '1.17.4'
```

**Step 5: Remove the obsolete layout and verify GREEN for this contract portion**

Run:

```bash
rm startos/install/versionGraph.ts startos/install/versions/index.ts
rmdir startos/install/versions startos/install
pnpm run check:startos-submission
npm run typecheck
```

Expected: the submission test advances past version-layout assertions; typechecking identifies only remaining SDK API migrations, if any.

**Step 6: Commit**

Run:

```bash
git add startos
git commit -m "chore: adopt StartOS version layout"
```

### Task 5: Migrate the Wrapper and Build to SDK 2.x

**Files:**
- Modify as required: `startos/manifest/index.ts`
- Modify as required: `startos/sdk.ts`
- Modify as required: `startos/main.ts`
- Modify as required: `startos/interfaces.ts`
- Modify as required: `startos/dependencies.ts`
- Modify as required: `startos/backups.ts`
- Modify as required: `startos/init/index.ts`
- Modify: `Makefile`
- Delete: `s9pk.mk`

**Step 1: Remove retired manifest documentation metadata**

Delete `docsUrls` from `startos/manifest/index.ts`. Preserve the package ID, repositories, volume, Docker build source, architectures, alerts, and dependency declarations.

**Step 2: Adopt the SDK Makefile**

Replace `Makefile` with:

```make
ARCHES := x86 arm
# overrides to s9pk.mk must precede the include statement
include node_modules/@start9labs/start-sdk/s9pk.mk
```

Delete the repository copy of `s9pk.mk`.

**Step 3: Run typechecking and the SDK lint runner**

Run:

```bash
npm run typecheck
node node_modules/@start9labs/start-sdk/lint.mjs
```

Expected: either both pass or failures point to specific SDK 2.x signature/user-facing-string changes.

**Step 4: Adapt only APIs rejected by SDK 2.x**

Use the installed SDK types as the source of truth. Preserve behavior while applying mechanical signature changes, such as removing obsolete `await` use or wrapping required user-facing strings with the SDK i18n helper. Do not redesign dependencies or service behavior in this task.

**Step 5: Verify the optimized build hook**

Run:

```bash
rm -rf javascript packages/*/dist
npm run build
test -f javascript/index.js
test -f packages/daemon/dist/main.js
test -d packages/dashboard/dist
make -s print-TARGETS
```

Expected: all built outputs exist and `print-TARGETS` prints `x86 arm`.

**Step 6: Re-run GREEN checks**

Run:

```bash
npm run check
pnpm run check:startos-submission
```

Expected: application checks pass; the submission test now fails only for workflows/documentation not yet added.

**Step 7: Commit**

Run:

```bash
git add startos Makefile s9pk.mk
git commit -m "build: migrate package to StartOS SDK 2"
```

### Task 6: Add Community Registry Workflows and Isolate Tag Namespaces

**Files:**
- Create: `.github/workflows/build.yml`
- Create: `.github/workflows/tagAndRelease.yml`
- Create: `.github/workflows/release.yml`
- Modify: `.github/workflows/docker-publish.yml`

**Step 1: Add the pull-request build entry point**

Create `.github/workflows/build.yml` from the official thin workflow, targeting `main`, calling `Start9Labs/start-technologies/.github/workflows/build.yml@master`, and forwarding optional `DEV_KEY`.

**Step 2: Add the merge-to-beta entry point**

Create `.github/workflows/tagAndRelease.yml` from the official thin workflow, targeting `main`. Pass `REFERENCE_REGISTRY`, `RELEASE_REGISTRY`, and `S3_S9PKS_BASE_URL`; pass `DEV_KEY`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`; grant `contents: write`.

**Step 3: Add the StartOS tag release entry point**

Create `.github/workflows/release.yml` from the official thin workflow but narrow the tag trigger to:

```yaml
on:
  push:
    tags:
      - 'v*_*'
```

This repository also publishes upstream application tags, so the official generic `v*.*` trigger is too broad here.

**Step 4: Prevent StartOS tags from entering the Docker job**

Add this job condition to `.github/workflows/docker-publish.yml`:

```yaml
if: ${{ !startsWith(github.ref, 'refs/tags/') || !contains(github.ref_name, '_') }}
```

This keeps branch/manual/upstream-tag builds and rejects StartOS wrapper tags.

**Step 5: Validate the YAML and tag guards**

Run:

```bash
node -e "const fs=require('fs'); const YAML=require('yaml'); for (const f of fs.readdirSync('.github/workflows')) if (f.endsWith('.yml')) YAML.parse(fs.readFileSync('.github/workflows/'+f,'utf8'));"
pnpm run check:startos-submission
```

Expected: all workflow files parse; the submission test advances to documentation assertions.

**Step 6: Commit**

Run:

```bash
git add .github/workflows
git commit -m "ci: add StartOS community release pipeline"
```

### Task 7: Rewrite the Package README and Instructions

**Files:**
- Modify: `README.md`
- Modify: `instructions.md`
- Modify if links change: `startos/manifest/index.ts`

**Step 1: Rewrite README.md**

Follow the approved design and official StartOS README structure. Begin with the centered `icon.png`, title the document `Hashrate Autopilot on StartOS`, link the upstream repository/docs, and state that unspecified behavior follows upstream.

Document exactly the current wrapper:

- Dockerfile-built image for `x86_64` and `aarch64`;
- `main` mounted at `/app/data` with SQLite and operator configuration;
- dashboard on HTTP port `3010` through interface `ui`;
- no StartOS actions;
- port-listening health check;
- full-volume backup/restore;
- required `bitcoind`, `electrs`, and `datum` dependencies and their declared purpose;
- StartOS-set environment variables from `startos/main.ts`;
- DRY-RUN default, dashboard-managed setup, and consequential limitations;
- unchanged upstream application behavior;
- contribution link; and
- YAML quick reference.

Do not include upstream/package version numbers or dependency version constraints.

**Step 2: Rewrite instructions.md**

Use these sections:

```markdown
# Hashrate Autopilot

## Documentation
## What you get on StartOS
## Getting set up
## Using Hashrate Autopilot
## Limitations
```

Port the former manifest documentation links with context. Begin setup at the dashboard's setup wizard, keep the operator in DRY-RUN, require verification of the public Datum/pool destination before LIVE mode, and explain the persistent volume and dependency defaults only where the operator must act.

Do not include package installation/download steps, package internals, generic StartOS UI explanations, version numbers, or secrets.

**Step 3: Verify documentation against code**

Run:

```bash
pnpm run check:startos-submission
rg -n "volumeId|mountpoint|bindPort|imageId|dependencies|checkPortListening|NODE_ENV|BHA_" startos
```

Expected: the submission contract passes. Manually compare every result to README and instructions.

**Step 4: Commit**

Run:

```bash
git add README.md instructions.md startos/manifest/index.ts
git commit -m "docs: align package guidance with StartOS registry"
```

### Task 8: Add Submission Evidence and Email Draft

**Files:**
- Create: `docs/startos-community-registry-submission.md`
- Modify: `docs/README.md`
- Modify: `docs/startos-packaging.md`

**Step 1: Create the submission checklist**

Document:

- public repository URL;
- package ID and intended ExVer/tag;
- upstream tag and merge commit;
- exact local verification commands with space for results;
- expected x86 and ARM artifacts;
- workflow/README/instructions compliance;
- a physical StartOS checklist for clean install, start, UI, health, uninstall/reinstall, and backup/restore;
- beta soak and production-promotion steps; and
- explicit boxes for incomplete external/device gates.

**Step 2: Add an email draft**

Include a concise, unsent draft addressed to `submissions@start9.com` with the public GitHub repository link, package purpose, supported architectures, test summary, and a statement that the service starts in DRY-RUN.

**Step 3: Update maintainer documentation**

Link the submission checklist from `docs/README.md`. Update `docs/startos-packaging.md` to distinguish the Start9 Community pipeline from optional local/manual GitHub release tooling and to record the `v{upstream}_{downstream}` tag format.

**Step 4: Verify and commit**

Run:

```bash
git diff --check
git add docs/startos-community-registry-submission.md docs/README.md docs/startos-packaging.md
git commit -m "docs: add Community Registry submission checklist"
```

### Task 9: Build and Inspect Both Packages

**Files:**
- Generated but never commit: `javascript/**`, `packages/*/dist/**`, `hashrate-autopilot-9_x86_64.s9pk`, `hashrate-autopilot-9_aarch64.s9pk`
- Update with actual evidence: `docs/startos-community-registry-submission.md`

**Step 1: Provision an untracked workspace build key if needed**

Use the current StartOS workspace/key layout reported by `start-cli`. Copy an existing local identity key only into ignored `.startos/` paths, set mode `0600`, and verify `git check-ignore .startos` before proceeding. Never print the key.

**Step 2: Run all local checks from clean dependencies**

Run:

```bash
rm -rf node_modules packages/*/node_modules
npm ci
npm run format:check
npm run check
npm run check:startos-submission
git diff --check
```

Expected: every command exits 0.

**Step 3: Build both architectures**

Run:

```bash
make clean
make x86
make arm
```

Expected: both named `.s9pk` files are created successfully.

**Step 4: Inspect manifests**

Run:

```bash
for package in hashrate-autopilot-9_x86_64.s9pk hashrate-autopilot-9_aarch64.s9pk; do
    start-cli s9pk inspect "$package" manifest \
        | jq '{id,title,version,sdkVersion,gitHash,images,dependencies,interfaces,releaseNotes}'
done
```

Expected for both: ID `hashrate-autopilot-9`, version `1.17.4:0`, SDK 2.x, a non-null clean git hash, intended dependencies/interface, and the matching architecture.

**Step 5: Verify checksums and git hygiene**

Run:

```bash
sha256sum hashrate-autopilot-9_x86_64.s9pk hashrate-autopilot-9_aarch64.s9pk
git status --short
git ls-files '*.s9pk' '.startos/**'
```

Expected: two hashes; generated packages/build directories are ignored; no secret/workspace files are tracked.

**Step 6: Record evidence and commit only documentation**

Update the submission checklist with command results, artifact sizes, manifest summary, and checksums. Mark the physical StartOS checks pending unless actually completed.

Run:

```bash
git add docs/startos-community-registry-submission.md
git commit -m "docs: record StartOS package verification"
```

### Task 10: Final Review and Physical-Device Handoff

**Files:**
- Modify only if review finds an issue: files identified by review.
- Update: `docs/startos-community-registry-submission.md`

**Step 1: Request code review**

Invoke @requesting-code-review. Review the full range from the pre-sync base through HEAD, emphasizing upstream conflict resolution, SDK migration, dual package-manager reproducibility, tag isolation, and documentation accuracy.

**Step 2: Address findings with TDD**

For any behavior defect, add or extend a failing test first, verify RED, implement the minimal fix, and verify GREEN. For configuration-only corrections, extend `tests/startos/test-community-registry.sh` before changing the configuration.

**Step 3: Run final verification**

Invoke @verification-before-completion, then run:

```bash
git diff --check
npm ci
npm run format:check
npm run check
npm run check:startos-submission
make clean
make x86
make arm
git status --short --branch
```

Inspect both manifests again after the final clean build.

**Step 4: Report the external gate honestly**

If a StartOS device is available, sideload the appropriate artifact and verify clean install, start, dashboard load, green health, backup/restore, uninstall, and reinstall in DRY-RUN. If no device is available, leave these boxes unchecked and report that the repository is locally prepared but not yet eligible to be emailed as fully pre-publish-checked.

**Step 5: Commit final evidence if changed**

Run:

```bash
git add docs/startos-community-registry-submission.md
git commit -m "docs: finalize Community Registry evidence"
```

Do not push or send the email draft.
