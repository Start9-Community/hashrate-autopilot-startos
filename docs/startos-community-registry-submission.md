# StartOS Community Registry Submission Checklist

> **STATUS: READY FOR THE INITIAL EMAIL AFTER THE CORRECTIVE SOURCE IS MERGED AND VERIFIED ON `main`.**
> Local package verification and the required physical-device validation have passed. The draft remains
> deliberately unsent so the maintainer controls the external submission. After Start9 responds and creates the
> Start9-Community fork, the fork pull request and merge follow Start9's feedback and review. Request
> production promotion only after a successful beta install, soak, and resolution of every beta finding.
> Evidence snapshot: **2026-08-04**.

This document is a maintainer handoff and evidence record. It does not authorize publishing, device
changes, marketplace activity, or any other external mutation.

## Official references

The following official Start9 sources were accessed and link-checked on 2026-08-04:

- [Publishing and Community Registry process](https://docs.start9.com/packaging/0.4.0.x/publishing.html) — initial email, Start9-Community fork and pull requests, automated beta publication, pre-publish checks, beta soak, and production promotion.
- [Versions and Git tag conventions](https://docs.start9.com/packaging/0.4.0.x/versions.html) — ExVer and the `v{upstream}_{downstream}` tag format.
- [Writing service READMEs](https://docs.start9.com/packaging/0.4.0.x/writing-readmes.html) — package README structure and pre-publish checklist.
- [Writing service instructions](https://docs.start9.com/packaging/0.4.0.x/writing-instructions.html) — operator-instruction scope and pre-publish checklist.
- [Official reusable build workflow](https://github.com/Start9Labs/start-technologies/blob/master/.github/workflows/build.yml), [tag-and-release workflow](https://github.com/Start9Labs/start-technologies/blob/master/.github/workflows/tagAndRelease.yml), and [release workflow](https://github.com/Start9Labs/start-technologies/blob/master/.github/workflows/release.yml) — Community pipeline implementations referenced by this repository's thin workflows.

## Submission identity

| Field | Intended value |
| --- | --- |
| Public package repository | <https://github.com/mdubore/hashrate-autopilot-startos> |
| Package ID | `hashrate-autopilot-9` |
| Upstream release | [`v1.17.4`](https://github.com/rdouma/hashrate-autopilot/releases/tag/v1.17.4) |
| Intended StartOS ExVer | `1.17.4:0` |
| Intended StartOS tag | `v1.17.4_0` |
| Reviewed public source | [`main`](https://github.com/mdubore/hashrate-autopilot-startos/tree/main) |
| Initial submission | Ready for the maintainer to send the public repository URL by email; no Start9-Community fork or pull request exists yet |
| Later Community pull requests | Open against the Start9-Community fork after Start9 creates it and provides feedback |

Do not create or push `v1.17.4_0` during preparation. In the official Community flow, changes go to
the Start9-Community fork, and a merged pull request drives the configured build, tag, and
`community-beta` deployment.

## Reproducibility and history

- `origin` is `https://github.com/mdubore/hashrate-autopilot-startos.git`.
- `upstream` is `https://github.com/rdouma/hashrate-autopilot.git`.
- Local annotated tag object `refs/tags/v1.17.4` is
  `3933bbf5f69f7b5471d45f1682135c22df1ae69b` and peels to upstream commit
  `dcd98b1d6dca8922a91fa1c939831ed19e7455b3`.
- The tag reference and peeled commit were previously matched to the `upstream` remote with
  `git ls-remote`. The upstream tag is annotated. No official Start9 source reviewed for this packet
  requires the wrapped upstream tag itself to carry a cryptographic signature, so a missing upstream
  tag signature is not classified as a blocker here.
- Downstream merge commit:
  `947060b1d4c408d68695e0fe3ca91f2d3ec1492e` (`chore: merge upstream v1.17.4`).
- Merge parents, in order:
  `96b59ccfec0f055f32edd0cbf2b498c68a802aa8` and
  `dcd98b1d6dca8922a91fa1c939831ed19e7455b3`. The second parent is the peeled upstream tag commit.
- An earlier preparation snapshot was made from branch `sync-upstream-v1.17.4` at
  `139c63d8991918473769e9410049e2a427bbfc6e` before the checklist existed. It is historical context
  only, not the authoritative Task 9 source or evidence commit.
- The superseded Task 9 provenance pair is tested clean source
  `404ad198ba242806a0042e4873df54636f1a6c64` and evidence commit
  `e27fc7e870d76c2e7843c0c7273980f0e7005b66`. It is retained as historical evidence only; the Task 10
  rebuild below supersedes its source and artifact values.
- The final Task 10 tested source is `b82884b089de8b41384ac47385c2efa83e9d0244`
  (`chore: remove legacy StartOS packaging paths`). Its evidence-document successor is the immediately
  following `docs: finalize Community Registry evidence` commit; Git history records that successor's
  SHA without requiring the commit to embed its own recursive identifier.
- The upstream sync, SDK 2 conversion, bridge-address correction, and completed physical gates were merged to
  public `main` in `a7c24f0b9e8a1e9c79349007ff36184612a03967`. The corrective submission commit that follows updates
  repository identity, standard package files, Docker CI, release metadata, and this handoff without changing
  the package ID or unpublished ExVer.

Identity commands:

```bash
git remote -v
git show-ref --tags refs/tags/v1.17.4
git rev-parse 'refs/tags/v1.17.4^{}'
git show --no-patch --format='%H%n%P%n%s' 947060b1d4c408d68695e0fe3ca91f2d3ec1492e
git merge-base --is-ancestor refs/tags/v1.17.4 HEAD
```

## Local evidence already recorded

These checks were run during preparation through commit `139c63d8`; they are historical evidence, not
a substitute for the final Task 10 source gates and rebuild.

| Check | Exact command | Recorded result |
| --- | --- | --- |
| StartOS SDK lint | `node node_modules/@start9labs/start-sdk/lint.mjs` | PASS |
| Root and workspace lint | `npm run lint` | PASS; only known generated-locale warnings |
| Root and workspace typecheck | `npm run typecheck` | PASS, including workspace `tsc --noEmit` checks |
| Full npm check | `npm run check` | PASS; Vitest: 80 test files, 746 tests passed, 1 test skipped |
| Submission contract | `npm run check:startos-submission` | PASS |
| Workflow YAML parse | `node -e "const fs=require('fs'); const YAML=require('yaml'); for (const f of fs.readdirSync('.github/workflows')) if (f.endsWith('.yml')) YAML.parse(fs.readFileSync('.github/workflows/'+f,'utf8'));"` | PASS |
| Workflow tag guards | `npm run check:startos-submission` | PASS; Community tags are `v*_*`, and StartOS underscore tags are excluded from the upstream Docker job |
| Clean application/release-input build | `rm -rf javascript packages/*/dist && npm run build` | PASS; StartOS JavaScript, daemon, dashboard, and workspace outputs regenerated |

## Superseded Task 9 executable command sequence

This historical block records how the superseded Task 9 evidence was produced. It removes only named/generated dependency,
build-output, checksum, and package paths before reinstalling; it deliberately does not invoke
`make clean`, because the SDK 2 target deletes `node_modules` and therefore removes the included
`s9pk.mk`. If a maintainer invokes `make clean` outside this sequence, run `npm ci` immediately
afterward and before the next `make` command.

The installed `start-cli 1.1.0` has no `s9pk verify` or `s9pk sign` subcommand. The supported read-only
signature evidence surface is `s9pk inspect ... commitment`, which displays the package root signature
hash and maximum size. Record that output without calling it independent cryptographic verification.
Manifest inspection and checksum verification are separate commands below.

With `start-cli 1.1.0`, `init-key` manages the CLI identity key at `~/.startos/id.key.pem`; it does not
create the SDK 2 package-signing key. Package signing instead uses `build.key.pem` from the nearest
ancestor packaging workspace whose `.startos/config.yaml` declares `schema: 1`. The block locates that
workspace without reading or printing the key, confirms that the key is owned by the current user, and
tightens its mode to `0600`. It stops if no existing workspace signing key is available. Never copy the
key into the repository, print its contents, or commit it.

`npm run format:check` is not a Task 9 gate. The all-repository command is baseline-invalid: it was
introduced with the initial monorepo scaffold but was never enforced by a workflow, and an original
scaffold source file fails under the original Prettier line as well as the current locked Prettier. Do
not mass-format application sources during release preparation; retain `npm run check` as the enforced
lint, typecheck, and test gate.

Some `start-cli 1.1.0` installations eagerly resolve the configured default host even for local `s9pk`
commands. The command-scoped shim below supplies loopback only to prevent a stale host such as
`dev-vm.local` from blocking local packaging; it does not contact a device or modify shared config. On
an x86_64 host whose builder lacks arm64 emulation, the arm step performs an explicit privileged host-kernel
binfmt registration for arm64, then confirms the builder advertises `linux/arm64`. This is an opt-in local
host mutation, not a repository, StartOS device, or shared-config change. Removing the helper container does
not remove the kernel registration; it can persist until the handler is unregistered or the host reboots.

```bash
set -euo pipefail

test "$(git rev-parse --show-toplevel)" = "$PWD"
test -z "$(git status --porcelain)"
source_commit="$(git rev-parse HEAD)"
execution_timestamp="$(date --iso-8601=seconds)"
printf 'tested source commit: %s\nexecution timestamp: %s\n' "$source_commit" "$execution_timestamp"

for path in \
  node_modules \
  packages/bitcoind-client/node_modules \
  packages/braiins-client/node_modules \
  packages/daemon/node_modules \
  packages/dashboard/node_modules \
  packages/shared/node_modules \
  javascript \
  packages/bitcoind-client/dist \
  packages/braiins-client/dist \
  packages/daemon/dist \
  packages/dashboard/dist \
  packages/shared/dist; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    find "$path" -depth -delete
  fi
done
for path in \
  packages/bitcoind-client/tsconfig.tsbuildinfo \
  packages/braiins-client/tsconfig.tsbuildinfo \
  packages/daemon/tsconfig.tsbuildinfo \
  packages/dashboard/tsconfig.tsbuildinfo \
  packages/shared/tsconfig.tsbuildinfo \
  hashrate-autopilot-9_x86_64.s9pk \
  hashrate-autopilot-9_aarch64.s9pk \
  SHA256SUMS; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    unlink "$path"
  fi
done

npm ci
npm run check
npm run check:startos-submission
node node_modules/@start9labs/start-sdk/lint.mjs
node -e "const fs=require('fs'); const YAML=require('yaml'); for (const f of fs.readdirSync('.github/workflows')) if (f.endsWith('.yml')) YAML.parse(fs.readFileSync('.github/workflows/'+f,'utf8'));"
git diff --check
start-cli --version

workspace_dir="$PWD"
while [ "$workspace_dir" != / ]; do
  workspace_config="$workspace_dir/.startos/config.yaml"
  if [ -f "$workspace_config" ] && grep -Eq '^schema:[[:space:]]*1[[:space:]]*$' "$workspace_config"; then
    break
  fi
  workspace_dir="$(dirname -- "$workspace_dir")"
done
test "$workspace_dir" != /
build_key="$workspace_dir/.startos/build.key.pem"
test -f "$build_key"
test -O "$build_key"
chmod 600 "$build_key"
test "$(stat -c '%a' "$build_key")" = "600"
printf 'workspace package-signing key owner: %s; permissions: %s\n' \
  "$(stat -c '%U' "$build_key")" "$(stat -c '%a' "$build_key")"

start_cli_real="$(command -v start-cli)"
cli_shim_dir="$(mktemp -d /tmp/hashrate9-task9-start-cli.XXXXXX)"
printf '#!/usr/bin/env bash\nexec %q -H http://127.0.0.1 "$@"\n' "$start_cli_real" \
  > "$cli_shim_dir/start-cli"
chmod 755 "$cli_shim_dir/start-cli"
export PATH="$cli_shim_dir:$PATH"

npm run build
make x86

builder_info="$(docker buildx inspect default --bootstrap)"
if ! grep -q 'linux/arm64' <<< "$builder_info"; then
  # Opt-in host mutation: registers qemu-aarch64 with the host kernel's binfmt_misc service.
  docker run --privileged --rm \
    tonistiigi/binfmt@sha256:d3b963f787999e6c0219a48dba02978769286ff61a5f4d26245cb6a6e5567ea3 \
    --install arm64
  builder_info="$(docker buildx inspect default --bootstrap)"
  grep -q 'linux/arm64' <<< "$builder_info"
fi
make arm

packages=(
  hashrate-autopilot-9_x86_64.s9pk
  hashrate-autopilot-9_aarch64.s9pk
)
for package in "${packages[@]}"; do
  test -f "$package"
  stat -c 'artifact: %n; size_bytes: %s' "$package"
  start-cli s9pk inspect "$package" manifest \
    | jq '{id, title, version, sdkVersion, gitHash, images, dependencies, interfaces: (if has("interfaces") then .interfaces else "not present in SDK2 manifest" end), releaseNotes}'
  start-cli s9pk inspect "$package" commitment
done

sha256sum "${packages[@]}" > SHA256SUMS
sha256sum -c SHA256SUMS
git status --short
test -z "$(git status --porcelain)"
test -z "$(git ls-files -- "${packages[@]}" SHA256SUMS)"
```

Pre-existing or stale files with these names are not evidence. The final Task 10 run replaced both packages
from its tested source commit. Do not attach or describe either package as available before the current
procedure passes and the evidence below is recorded.

## Task 10 final rebuild procedure

Task 10 began from the clean source-fix commit, removed only the exact two package paths and checksum,
then ran `npm run build`, `make x86`, and `make arm` sequentially. It reused the nearest SDK 2 workspace
`build.key.pem` in place at mode `0600` and supplied the configured localhost host only through a
command-scoped `start-cli` shim. The pre-existing `qemu-aarch64` binfmt handler was enabled and the
default builder already advertised `linux/arm64`, so Task 10 did not re-register binfmt or change shared
configuration.

The final inspection commands checked identity, version, SDK version, source hash, architecture, packed
image, dependencies, release notes, and the absence of SDK 2 `alerts` and `interfaces` fields. Commitment
inspection remained a read-only report of `rootSighash` and `rootMaxsize`, not an independent signature
verification. `SHA256SUMS` was generated only after both fresh package builds completed and was then
verified with `sha256sum -c`.

## Current bridge-migration build result and evidence record

This record covers the clean rebuild after replacing legacy service addressing with SDK-managed bridge
resolution. The evidence-only documentation commit follows the tested source commit.

| Run evidence | Result |
| --- | --- |
| Tested source commit | `b11a747bd6b595b4d57e9766505ce7a3d0884aea` — clean bridge-migration source commit; the evidence-only documentation commit follows it |
| Execution timestamp, including time zone | `2026-08-04T21:08:33-07:00` |
| `start-cli --version` | `start-cli 1.1.0` |
| Workspace package-signing key ownership/mode preflight | PASS; nearest SDK 2 workspace `build.key.pem`, owner `missydog` (current user), mode `0600`; no key contents printed or copied |
| Host arm64 build support | PASS; host `qemu-aarch64` binfmt handler enabled and default builder advertised `linux/arm64`; the bridge rebuild did not re-register binfmt |
| Full lint/typecheck/test check and totals | PASS at the tested source commit; 81 test files passed with 1 skipped, and 752 tests passed with 1 skipped. Lint reported 0 errors and the 6 known generated-catalog warnings. |
| Focused TypeScript check | PASS; root StartOS TypeScript and all workspace typechecks completed successfully |
| Submission contract | PASS |
| SDK lint | PASS |
| Workflow parse and tag guards | PASS; every remaining workflow YAML file parsed, and the submission contract passed its tag guards |
| Focused documentation format check | PASS; both changed StartOS documentation files use Prettier style |
| `git diff --check` | PASS |
| Fresh release-input build | PASS; workspace, daemon, dashboard, and StartOS JavaScript outputs regenerated; only known Vite native-config, chunk-size, and plugin-timing warnings |
| Generated release notes cleanup | PASS; ignored stale `.github/release-notes.generated.md` was unlinked and can be regenerated by release tooling |
| Final tracked-worktree status | PASS before the evidence edit; packages, checksum, JavaScript, and workspace build outputs were ignored and untracked |

| Artifact evidence | x86_64 | aarch64 |
| --- | --- | --- |
| Filename | `hashrate-autopilot-9_x86_64.s9pk` | `hashrate-autopilot-9_aarch64.s9pk` |
| Size in bytes | `79063008` | `76826595` |
| SHA-256 | `c89ea61c389c0c61c01c25b71f728b0c3984b8406a4a739dba9b2ee7f84c31f9` | `5d4deae9f16e17197afc3489edfb4ee3db0bf110a4073f2b9b058726af44e391` |
| Commitment/signature inspection result | `rootSighash: 4mO1zhj1pvYNcJ0G0rgUFHvhIZBnwbot4lG9y7Qxw24`; `rootMaxsize: 445` | `rootSighash: ruWf1T9aYnuAhmwOxGDPKB9IHulQoZsxg6DomS72X2w`; `rootMaxsize: 445` |
| Manifest package ID | `hashrate-autopilot-9` | `hashrate-autopilot-9` |
| Manifest title | `Hashrate Autopilot for StartOS` | `Hashrate Autopilot for StartOS` |
| Manifest version | `1.17.4:0` | `1.17.4:0` |
| Manifest SDK version | `2.0.9` | `2.0.9` |
| Manifest git hash | `b11a747bd6b595b4d57e9766505ce7a3d0884aea` | `b11a747bd6b595b4d57e9766505ce7a3d0884aea` |
| Manifest architecture | `x86_64` | `aarch64` |
| Manifest image summary | `main`: packed; `arch: [x86_64]`; `emulateMissingAs: x86_64`; `nvidiaContainer: false` | `main`: packed; `arch: [aarch64]`; `emulateMissingAs: x86_64`; `nvidiaContainer: false` |
| Manifest dependency IDs | `bitcoind`, `datum`, `electrs` | `bitcoind`, `datum`, `electrs` |
| Manifest dependency summaries | All required (`optional: false`): `bitcoind` provides the local Bitcoin node for Datum and optional BIP 110 checks; `datum` receives rented hashrate and exposes gateway statistics; `electrs` provides Ocean payout lookups/backfill | Same as x86_64 |
| Manifest alerts field | Not present: SDK 2 package manifests do not emit the removed `alerts` field | Not present: SDK 2 package manifests do not emit the removed `alerts` field |
| Manifest interface IDs | Not present: SDK 2 package manifests have no `interfaces` field | Not present: SDK 2 package manifests have no `interfaces` field |
| Manifest release notes (`en_US`) | Upstream v1.17.4 update covering Ocean payout deductions/corrections, Timeline-note persistence, Electrum socket error handling, Bitaxe number formatting, Telegram 2FA-note removal, and the user FAQ; includes the upstream v1.17.4 release URL | Same as x86_64 |

- [x] Bridge-migration rebuild completed from the recorded clean source commit.
- [x] Workspace package-signing key preflight passed without copying, printing, or committing the key.
- [x] Fresh x86_64 and aarch64 packages built and match the recorded filenames.
- [x] Both manifests inspected and every requested field recorded, including absent SDK 2 alerts and interface fields.
- [x] Both commitment/signature inspection results recorded without overstating verification.
- [x] Both artifact sizes and SHA-256 values recorded; `sha256sum -c SHA256SUMS` passed.
- [x] Generated artifacts, checksum file, and build outputs remain uncommitted.

### Bridge-migration rebuild notes

- The prior ignored ARM package and checksum were unlinked by exact path before rebuilding. The prior
  root-level x86 sideload package was replaced only after the corrected package passed inspection and
  checksum verification. No `make clean` or broader cleanup ran.
- The inherited workspace host was `dev-vm.local`, which did not resolve. A command-scoped loopback shim
  allowed local `s9pk` operations without editing shared config or contacting a device.
- The host `qemu-aarch64` binfmt handler was already enabled and the builder advertised `linux/arm64` before
  packaging. Both architecture builds succeeded sequentially; the rebuild performed no privileged registration.
- Commitment inspection reports the package root signature hash and maximum size. It is recorded as the
  supported read-only evidence surface, not as independent cryptographic verification.

## Package compliance

These repository-level checks were reconfirmed for the bridge-migration rebuild:

- [x] Version metadata uses ExVer `1.17.4:0`; the intended tag follows `v{upstream}_{downstream}` as `v1.17.4_0`.
- [x] `.github/workflows/build.yml`, `tagAndRelease.yml`, and `release.yml` call the official Start9 reusable workflows.
- [x] `AGENTS.md`, the one-line `CLAUDE.md` import, `TODO.md`, `UPDATING.md`, `assets/`, `instructions.md`, and the other standard package-root files are present.
- [x] The pull-request workflow declares no persistent developer-key mapping; the release workflow files declare the required variable and secret mappings and are owner-guarded so publication runs only in the future Start9-Community fork. Repository files do not prove that those external values are configured in that fork.
- [x] The Community tag trigger accepts `v*_*`, while the upstream Docker workflow excludes underscore tags.
- [x] `README.md` follows the official package README role, documents runtime/image, volumes, interface, health, dependencies, backup/restore, limitations, and contains no release version.
- [x] `instructions.md` is an operator quick-start, begins after installation, names real UI surfaces, contains no release version or secret, and keeps the operator in DRY-RUN until routing and decisions are verified.
- [x] Bitcoin RPC, Datum, and Electrs endpoints use `sdk.host.getBridgeAddress(...).const()`; runtime
      wrapper source and dashboard guidance contain no deprecated `.startos` service names.
- [x] The package ID, repository links, architecture declarations, version graph, and generated-artifact names agree.

## Physical StartOS gates

Device results below were reported by the package owner on `2026-08-04T21:47:55-07:00` using the
recorded x86_64 artifact. Keep the controller in **DRY-RUN** throughout remaining testing. Never enable
LIVE or create, edit, or cancel a marketplace bid during automated preparation.

- [x] Clean-install the freshly built package on a supported StartOS device.
- [x] Start the service successfully.
- [x] Open the setup wizard and dashboard UI.
- [x] Confirm the StartOS dashboard-listener health check passes.
- [x] Confirm Bitcoin, Electrs, and Datum use their StartOS-assigned bridge endpoints and remain healthy after restart.
- [x] Confirm DRY-RUN prevents new create, edit, and cancel API mutations.
- [x] Verify active-bid safety: changing to DRY-RUN or PAUSED does not itself cancel an existing bid; independently confirm no active bid is spending before treating spend as stopped.
- [x] Uninstall and reinstall cleanly.
- [x] Back up, restore, and verify persistent configuration/state.

## Stage gates

### Before the initial email

- [x] Reconfirm the final bridge-migration evidence and current local artifacts.
- [x] Merge and push the reviewed source to the renamed public package repository's default branch.
- [x] Use the verified public [`main`](https://github.com/mdubore/hashrate-autopilot-startos/tree/main) source URL in the initial email.
- [x] Complete every physical StartOS gate above in DRY-RUN, including active-bid safety and backup/restore.
- [x] Replace every email-draft validation placeholder with the completed local, package, device, and safety results.
- [ ] Send the initial submission email. Later fork, beta, and promotion gates are not prerequisites for this email.

### After Start9 responds: fork, pull request, merge, and beta

- [ ] Receive the Start9-Community fork and address Start9's initial review feedback.
- [ ] Confirm the future Start9-Community fork has the required release variables and secrets configured; the repository proves only that workflow mappings are declared.
- [ ] Open the submission pull request against the Start9-Community fork.
- [ ] Receive a passing Community pull-request build and review; do not claim this before the external run completes.
- [ ] Have Start9 merge the pull request and verify that automation builds, tags, and deploys the package to `community-beta`.
- [ ] Install the package from `community-beta` and repeat the physical StartOS checks in DRY-RUN.

### Before production promotion

- [ ] Soak the successful beta installation for at least a couple of days, with maintainer/tester observation as recommended by Start9.
- [ ] Resolve every beta finding through another pull request and repeat the beta install/soak cycle as needed.
- [ ] Request production promotion by emailing `submissions@start9.com` or opening an issue on the Start9-Community fork.
- [ ] Verify Start9 promoted the tested beta build to the production `community` registry.

## Known non-blocking warnings

- Lint reports warnings from generated Lingui locale catalogs. Generated locale warnings are not lint
  failures, but any new warning outside the known generated files must be investigated.
- The all-repository Prettier check is baseline-invalid and is not a Task 10 gate. It reports existing
  tracked application source files; Task 10 checked only its focused StartOS documentation files.
- The Vite build emits known chunk-size/plugin timing warnings, and exercised Fastify paths emit known
  warnings. They did not fail the recorded build; Task 10 confirmed the Vite warnings did not become errors.
- Both package builds warn that `bitcoind`, `datum`, and `electrs` have no package metadata. Their manifest
  dependency IDs and descriptions are present; the missing optional metadata did not fail packaging.
- The superseded Task 9 run's first arm64 attempt failed at `/bin/sh` with `exec format error` because the
  default builder lacked arm64 emulation. A single privileged host-kernel registration using
  `tonistiigi/binfmt@sha256:d3b963f787999e6c0219a48dba02978769286ff61a5f4d26245cb6a6e5567ea3`
  added `qemu-aarch64`; the builder then advertised `linux/arm64`, and the one retry completed
  successfully. The cached image reports `binfmt/3a63696`, QEMU `v10.2.1`, and an
  `--uninstall` option; local binary inspection shows matching entries are unregistered by writing `-1` to
  their `binfmt_misc` handler. Task 10 observed the handler enabled and reused it without mutation. This
  packet does not prescribe an untested cleanup command: reboot the host or manually unregister the
  `qemu-aarch64` handler when removal is required. Container exit alone does not remove the registration.
- Auditing the full lockfile reports advisories in dependencies used only by build/development tooling.
  The daemon production-runtime audit is zero. Treat a new runtime advisory, or a change in the existing
  build-only advisory set, as a release blocker pending review.

## UNSENT email draft

> **UNSENT — validation is complete, but sending the email remains an explicit maintainer action.**

```text
To: submissions@start9.com
Subject: Community Registry submission — Hashrate Autopilot for StartOS

Hello Start9 team,

Please consider Hashrate Autopilot for the Start9 Community Registry:
https://github.com/mdubore/hashrate-autopilot-startos

Reviewed public branch: https://github.com/mdubore/hashrate-autopilot-startos/tree/main

Package ID: hashrate-autopilot-9
Purpose: monitor and safely control an operator's Braiins Hashpower marketplace bid while routing rented hashrate to an operator-selected pool destination.
Architectures: x86_64 and aarch64.

Local validation: SDK lint, TypeScript checks, the full application test suite, the Community submission contract, workflow parsing, the regular Docker image build, and clean StartOS package builds pass.
Package validation: fresh x86_64 and aarch64 packages report ID hashrate-autopilot-9, version 1.17.4:0, SDK 2.0.9, the expected architecture and dependencies, and verified SHA-256 checksums.
Physical StartOS validation: clean installation, dependency integration, service start, dashboard access, restart, uninstall/reinstall, backup, and restore were verified on 2026-08-04.
Safety validation: physical testing remained in DRY-RUN, new marketplace mutations were prevented, and active-bid behavior was checked separately.

The service is configured to start in DRY-RUN. Physical validation remained in DRY-RUN and did not create, edit, or cancel marketplace bids.

Regards,
mdubore
```

No package attachments are required or included. Fork/PR, beta, and promotion items remain pending until
their later stages of the official process.
