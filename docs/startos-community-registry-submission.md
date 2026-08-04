# StartOS Community Registry Submission Checklist

> **STATUS: PREPARATION ONLY — NOT READY TO SUBMIT.** Do not send the email, open the
> Start9-Community pull request, create or push a tag, or request promotion until every required
> unchecked gate below has passed. Evidence snapshot: **2026-08-04**.

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
| Public package repository | <https://github.com/mdubore/hashrate9> |
| Package ID | `hashrate-autopilot-9` |
| Upstream release | [`v1.17.4`](https://github.com/rdouma/hashrate-autopilot/releases/tag/v1.17.4) |
| Intended StartOS ExVer | `1.17.4:0` |
| Intended StartOS tag | `v1.17.4_0` |
| Preparation/source branch | `sync-upstream-v1.17.4` |
| Initial submission | Public repository URL by email; no pull request exists yet |
| Later Community pull requests | Open from this prepared branch, or its pushed equivalent, against the Start9-Community fork after Start9 creates it and provides feedback |

Do not create or push `v1.17.4_0` during preparation. In the official Community flow, changes go to
the Start9-Community fork, and a merged pull request drives the configured build, tag, and
`community-beta` deployment.

## Reproducibility and history

- `origin` is `https://github.com/mdubore/hashrate9.git`.
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
- This evidence snapshot was prepared from branch `sync-upstream-v1.17.4` at
  `139c63d8991918473769e9410049e2a427bbfc6e` before this checklist commit.

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
a substitute for the final clean Task 9 rerun.

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

## Final clean local rerun — Task 9

Run these from a clean dependency tree in Task 9. Do not mark this block complete from the historical
results above.

- [ ] Remove only generated dependency/build outputs, then run `npm ci`.
- [ ] Run `npm run format:check`.
- [ ] Run `npm run check` and record the fresh lint, typecheck, and test totals.
- [ ] Run `npm run check:startos-submission`.
- [ ] Parse every `.github/workflows/*.yml` file and recheck both tag guards.
- [ ] Run `git diff --check`.
- [ ] Run the clean release-input build and confirm every required output exists.

## Package artifact gates — Task 9

The expected generated files are ignored, uncommitted release artifacts:

- `hashrate-autopilot-9_x86_64.s9pk`
- `hashrate-autopilot-9_aarch64.s9pk`

Pre-existing or stale files with these names are not evidence. Task 9 must rebuild and inspect both from
the final clean commit. Do not attach or describe either package as available before these gates pass.

- [ ] Build fresh `hashrate-autopilot-9_x86_64.s9pk` from the final clean commit.
- [ ] Build fresh `hashrate-autopilot-9_aarch64.s9pk` from the final clean commit.
- [ ] Inspect the x86_64 manifest and record ID, ExVer, SDK, git hash, dependencies, interface, and architecture.
- [ ] Inspect the aarch64 manifest and record ID, ExVer, SDK, git hash, dependencies, interface, and architecture.
- [ ] Generate and verify checksums for the same two freshly built files.
- [ ] Confirm and record the expected signing identity/signature for both fresh artifacts without exposing private key material.
- [ ] Confirm the generated artifacts, checksum file, build outputs, and `.startos/` workspace material remain uncommitted.

## Package compliance

These repository-level checks were established before the final Task 9 rerun:

- [x] Version metadata uses ExVer `1.17.4:0`; the intended tag follows `v{upstream}_{downstream}` as `v1.17.4_0`.
- [x] `.github/workflows/build.yml`, `tagAndRelease.yml`, and `release.yml` call the official Start9 reusable workflows.
- [x] Pull-request builds do not receive the persistent developer key; the Community release workflows retain their required configured secrets.
- [x] The Community tag trigger accepts `v*_*`, while the upstream Docker workflow excludes underscore tags.
- [x] `README.md` follows the official package README role, documents runtime/image, volumes, interface, health, dependencies, backup/restore, limitations, and contains no release version.
- [x] `instructions.md` is an operator quick-start, begins after installation, names real UI surfaces, contains no release version or secret, and keeps the operator in DRY-RUN until routing and decisions are verified.
- [x] The package ID, repository links, architecture declarations, version graph, and generated-artifact names agree.

## Physical StartOS gates

All device work is deliberately pending. Keep the controller in **DRY-RUN** throughout testing. Never
enable LIVE or create, edit, or cancel a marketplace bid during automated preparation.

- [ ] Clean-install the freshly built package on a supported StartOS device.
- [ ] Start the service successfully.
- [ ] Open the setup wizard and dashboard UI.
- [ ] Confirm the StartOS health check becomes green.
- [ ] Confirm required Bitcoin, Electrs, and Datum dependency behavior and routing.
- [ ] Confirm DRY-RUN prevents new create, edit, and cancel API mutations.
- [ ] Verify active-bid safety: changing to DRY-RUN or PAUSED does not itself cancel an existing bid; independently confirm no active bid is spending before treating spend as stopped.
- [ ] Uninstall and reinstall cleanly.
- [ ] Back up, restore, and verify persistent configuration/state.

## Community beta and production gates

The following are external actions in the official process and remain pending:

- [ ] Send the initial submission email only after every required local, artifact, and physical-device gate is complete.
- [ ] Receive the Start9-Community fork and any review feedback from Start9.
- [ ] Open the submission pull request against the Start9-Community fork.
- [ ] Receive a passing Community pull-request build and review; do not claim this before the external run completes.
- [ ] Have Start9 merge the pull request and verify that automation builds, tags, and deploys the package to `community-beta`.
- [ ] Install the package from `community-beta` and repeat the physical StartOS checks in DRY-RUN.
- [ ] Soak in beta for at least a couple of days, with maintainer/tester observation as recommended by Start9.
- [ ] Resolve any beta findings through another pull request and repeat the beta cycle.
- [ ] Request production promotion by emailing `submissions@start9.com` or opening an issue on the Start9-Community fork.
- [ ] Verify Start9 promoted the tested beta build to the production `community` registry.

## Blockers and known non-blocking warnings

### Blocking submission

- Fresh Task 9 dependency, format, check, contract, workflow, and clean-build reruns are not recorded.
- Fresh x86_64 and aarch64 package builds, manifest inspections, checksums, and signatures are not recorded.
- Every physical StartOS gate is untested in this evidence snapshot.
- The beta soak and production-promotion gates have not started.

### Known non-blocking warnings

- Lint reports warnings from generated Lingui locale catalogs. Generated locale warnings are not lint
  failures, but any new warning outside the known generated files must be investigated.
- The Vite build emits known chunk-size/plugin timing warnings, and exercised Fastify paths emit known
  warnings. They did not fail the recorded check/build, but Task 9 must confirm they have not become errors
  or changed unexpectedly.
- Auditing the full lockfile reports advisories in dependencies used only by build/development tooling.
  The daemon production-runtime audit is zero. Treat a new runtime advisory, or a change in the existing
  build-only advisory set, as a release blocker pending review.

## UNSENT email draft

> **UNSENT — send only after all required local, package, physical-device, and safety gates above are complete.**

```text
To: submissions@start9.com
Subject: Community Registry submission — Hashrate Autopilot for StartOS

Hello Start9 team,

Please consider Hashrate Autopilot for the Start9 Community Registry:
https://github.com/mdubore/hashrate9

Package ID: hashrate-autopilot-9
Purpose: monitor and safely control an operator's Braiins Hashpower marketplace bid while routing rented hashrate to an operator-selected pool destination.
Architectures: x86_64 and aarch64.

Local lint, typecheck, test, submission-contract, workflow, clean-build, dual-package, manifest, checksum, signature, and physical StartOS results:
[INSERT THE COMPLETED FINAL EVIDENCE SUMMARY HERE BEFORE SENDING]

The service starts in DRY-RUN. LIVE bidding was not enabled during automated preparation, and the physical safety checks confirmed the documented active-bid behavior.

Regards,
[MAINTAINER NAME]
```

No package attachments are claimed or included by this draft. If any required box remains unchecked,
leave this draft unsent.
