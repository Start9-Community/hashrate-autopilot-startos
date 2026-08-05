# StartOS Dependency Bridge Resolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace legacy StartOS dependency DNS with SDK-managed bridge addresses and produce corrected sideload artifacts.

**Architecture:** Resolve Bitcoin RPC, DATUM HTTP, and Electrs TCP bindings reactively in `setupMain`. Pass a small pure adapter the nullable bridge addresses and spread only available overrides into the daemon environment, preserving safe startup when an integration is unavailable.

**Tech Stack:** TypeScript, StartOS SDK 2.0.9, Vitest, Bash, `start-cli`, Docker Buildx.

---

### Task 1: Define the dependency environment adapter test-first

**Files:**
- Create: `startos/dependency-addresses.test.ts`
- Create: `startos/dependency-addresses.ts`
- Modify: `vitest.config.ts`

**Step 1: Write the failing unit tests**

Add `startos` to the Vitest projects, then cover HTTP URL construction, Electrs host/port splitting, bracketed IPv6 parsing, and omission of overrides for null addresses.

**Step 2: Verify RED**

Run: `npx vitest run startos/dependency-addresses.test.ts`

Expected: FAIL because `dependency-addresses.ts` does not exist.

**Step 3: Write the minimal adapter**

Export a typed `buildDependencyEnv` function that accepts nullable Bitcoin, DATUM, and Electrs bridge addresses and returns only the corresponding `BHA_*` environment entries.

**Step 4: Verify GREEN**

Run: `npx vitest run startos/dependency-addresses.test.ts`

Expected: all adapter tests pass.

**Step 5: Commit**

```bash
git add startos/dependency-addresses.ts startos/dependency-addresses.test.ts vitest.config.ts
git commit -m "test: define StartOS dependency address mapping"
```

### Task 2: Enforce and implement managed bridge resolution

**Files:**
- Modify: `tests/startos/test-community-registry.sh`
- Modify: `startos/main.ts`

**Step 1: Add the failing packaging regression**

Require active `sdk.host.getBridgeAddress` use and reject runtime `.startos` service names in `startos/*.ts`.

**Step 2: Verify RED**

Run: `npm run check:startos-submission`

Expected: FAIL because `startos/main.ts` still contains legacy addresses and no bridge resolver.

**Step 3: Resolve the published dependency bindings**

In `setupMain`, resolve:

- `bitcoind` / `rpc` / `8332` / `ssl: false`
- `datum` / `main` / `7152` / `ssl: false`
- `electrs` / `electrum` / `50001` / `ssl: false`

Call `.const()` for reactive regeneration, then merge `buildDependencyEnv(...)` into the daemon environment.

**Step 4: Verify GREEN**

Run:

```bash
npm run check:startos-submission
npx tsc --noEmit
npm run build:startos
```

Expected: the registry contract, TypeScript compilation, and StartOS JavaScript bundle pass.

**Step 5: Commit**

```bash
git add startos/main.ts tests/startos/test-community-registry.sh
git commit -m "fix: resolve StartOS dependency bridge addresses"
```

### Task 3: Update operator and submission documentation

**Files:**
- Modify: `packages/daemon/src/services/datum.test.ts`
- Modify: `packages/daemon/src/services/datum.ts`
- Modify: `packages/daemon/src/main.ts`
- Modify: `packages/dashboard/src/pages/Config.tsx`
- Modify: `packages/dashboard/src/pages/Setup.tsx`
- Modify: `packages/dashboard/src/locales/*/messages.po`
- Modify: `README.md`
- Modify: `instructions.md`
- Modify: `docs/startos-community-registry-submission.md`

**Step 1: Write the failing DATUM precedence test**

Test that `BHA_DATUM_API_URL` wins over the SQLite value on every poll, that a missing override preserves ordinary saved configuration, and that an explicitly empty override disables polling.

Run: `npx vitest run packages/daemon/src/services/datum.test.ts`

Expected: FAIL because the resolver does not exist.

**Step 2: Make managed DATUM routing authoritative**

Add a pure resolver and use it in the poller's live URL callback so dependency port changes cannot fall back to stale SQLite state.

**Step 3: Document managed dependency routing**

Explain that StartOS resolves the installed dependency bindings at runtime and injects their assigned bridge endpoints. Do not publish assigned bridge ports or legacy DNS names.
Replace dashboard placeholders and help text that recommend legacy `.startos` service names, then regenerate locale catalogs.

**Step 4: Refresh the submission checklist**

Record bridge-address verification as complete in source and leave physical sideload/uninstall/reinstall items open for the package owner.

**Step 5: Verify implementation and documentation contracts**

Run:

```bash
npm run check:startos-submission
npx vitest run packages/daemon/src/services/datum.test.ts
npx prettier --check README.md instructions.md docs/startos-community-registry-submission.md
```

Expected: both checks pass.

**Step 6: Commit**

```bash
git add packages/daemon/src/services/datum.test.ts packages/daemon/src/services/datum.ts packages/daemon/src/main.ts packages/dashboard/src/pages/Config.tsx packages/dashboard/src/pages/Setup.tsx packages/dashboard/src/locales/*/messages.po README.md instructions.md docs/startos-community-registry-submission.md docs/plans/2026-08-04-startos-dependency-bridge-design.md docs/plans/2026-08-04-startos-dependency-bridge.md
git commit -m "docs: describe managed StartOS dependency routing"
```

### Task 4: Verify and build sideload artifacts

**Files:**
- Generated, untracked: `hashrate-autopilot-9_x86_64.s9pk`
- Generated, untracked: `hashrate-autopilot-9_aarch64.s9pk`

**Step 1: Run repository verification**

Run:

```bash
git diff --check
npm run check:startos-submission
npm run check
npm run build:startos
```

Expected: all checks pass.

**Step 2: Build both architectures**

Run the repository's documented `start-cli s9pk pack` commands for `x86_64` and `aarch64`.

Expected: both packages build successfully with version `1.17.4:0`.

**Step 3: Verify package metadata and checksums**

Inspect both artifacts with `start-cli s9pk inspect` and record SHA-256 checksums.

**Step 4: Place the x86 artifact in the current project directory**

Copy the corrected x86 package from the isolated worktree to `/home/missydog/Desktop/Learnding/Tools/Hashrate9/hashrate-autopilot-9_x86_64.s9pk`, replacing the earlier generated artifact.

**Step 5: Confirm source cleanliness**

Run: `git status --short --branch`

Expected: generated packages remain ignored/untracked as designed and tracked source is clean.

Physical sideload and uninstall/reinstall verification is intentionally left to the package owner.
