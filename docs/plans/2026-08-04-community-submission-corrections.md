# Community Submission Corrections Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the renamed public repository conform to the StartOS 0.4 package structure and leave its source, CI, release metadata, submission packet, and ignored release artifacts ready for the initial Community Registry email.

**Architecture:** Keep the published package identity at `hashrate-autopilot-9` and the unpublished package version at `1.17.4:0`, while changing repository identity to `mdubore/hashrate-autopilot-startos`. Extend the existing shell submission contract so structural and release-policy regressions fail locally, and keep ordinary upstream Docker builds separate from the StartOS package-input build.

**Tech Stack:** Bash contract tests, TypeScript/Node.js workspaces, Docker BuildKit, StartOS SDK 2.x, GitHub Actions, `start-cli`.

---

### Task 1: Extend the submission contract

**Files:**
- Modify: `tests/startos/test-community-registry.sh`

1. Add assertions for `AGENTS.md`, the one-line `CLAUDE.md`, `TODO.md`, and `UPDATING.md`.
2. Assert all canonical package repository URLs use `mdubore/hashrate-autopilot-startos`.
3. Assert `Dockerfile` uses the ordinary workspace build and the package script retains the StartOS release-input build.
4. Assert the manual release profile derives canonical `v1.17.4_0` tags.
5. Run `npm run check:startos-submission` and confirm it fails for the missing structure and stale metadata.

### Task 2: Correct tracked package and repository metadata

**Files:**
- Create: `AGENTS.md`
- Create: `TODO.md`
- Create: `UPDATING.md`
- Modify: `CLAUDE.md`
- Modify: `package.json`
- Modify: `startos/manifest/index.ts`
- Modify: `CONTRIBUTING.md`
- Modify: `.github/ISSUE_TEMPLATE/*.yml`
- Modify: `.github/release-profile.env`
- Modify: `.github/release-notes-template.md`

1. Add the required StartOS package context and upstream-update worklist files.
2. Replace repository URLs with the renamed public repository.
3. Make the manual release profile derive `v1.17.4_0` from `startos/versions/current.ts`.
4. Preserve the existing package ID and unpublished ExVer.

### Task 3: Fix ordinary Docker CI

**Files:**
- Modify: `Dockerfile`

1. Change the ordinary application image build step from the StartOS-specific root script to `pnpm -r run build`.
2. Run the focused contract and a local `docker build` reproducer.

### Task 4: Refresh submission documentation

**Files:**
- Modify: `docs/startos-community-registry-submission.md`
- Modify: `docs/startos-packaging.md`
- Modify: `docs/upstream-install.md`

1. Replace the repository URL and stale branch/source statements.
2. Mark completed initial-email gates with exact public commit evidence where available.
3. Replace the email placeholders with verified results while leaving the draft explicitly unsent.
4. Correct artifact locations and checksum claims.

### Task 5: Verify source and ignored artifacts

**Files:**
- Ignored output: `hashrate-autopilot-9_x86_64.s9pk`
- Ignored output: `hashrate-autopilot-9_aarch64.s9pk`
- Ignored output: `SHA256SUMS`

1. Run the submission contract, SDK lint, TypeScript compilation, and full test suite.
2. Build or copy the already verified current `1.17.4:0` architecture packages into the repository root.
3. Inspect both manifests from outside the configured StartOS workspace.
4. Regenerate `SHA256SUMS` and run `sha256sum -c SHA256SUMS`.
5. Run `git diff --check` and confirm only intended tracked files changed.

### Task 6: Publish the corrective source commit

1. Commit the verified tracked changes with an imperative conventional subject.
2. Push the corrective branch and merge it into `main` as authorized.
3. Push `main`, verify local and remote commit identity, and inspect the resulting GitHub checks.
4. Do not create a tag, GitHub Release, registry publication, or send the submission email.
