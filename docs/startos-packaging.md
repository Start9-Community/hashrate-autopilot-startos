# StartOS Packaging Notes

This document records the local packaging conventions for maintaining the Hashrate Autopilot StartOS service.

## Primary references

Use the official StartOS packaging guide as the source of truth. If a local checkout of the docs exists, start with
`start-docs/packaging/src/SUMMARY.md` and open only the sections needed for the current change. Otherwise, use the
published packaging documentation at <https://docs.start9.com/packaging/>. For releases, consult the official
[publishing](https://docs.start9.com/packaging/0.4.0.x/publishing.html),
[versioning](https://docs.start9.com/packaging/0.4.0.x/versions.html),
[README](https://docs.start9.com/packaging/0.4.0.x/writing-readmes.html), and
[instructions](https://docs.start9.com/packaging/0.4.0.x/writing-instructions.html) pages. The current preparation
record is the [Community Registry submission checklist](startos-community-registry-submission.md).

## Local package files

- `startos/manifest/index.ts` - package identity, dependency declarations, volumes, and image build.
- `startos/manifest/i18n.ts` - StartOS short and long descriptions.
- `startos/dependencies.ts` - dependency configuration and health integration.
- `startos/backups.ts` - backup and restore behavior for persistent state.
- `startos/init/index.ts` - runtime initialization before the daemon starts.
- `instructions.md` - install-time operator instructions shown by StartOS.
- `Makefile` - convenience targets provided by the StartOS SDK around `start-cli s9pk pack`.
- `.github/release-profile.env` - GitHub release profile consumed by the local `publishing-github-releases` Codex skill.
- `scripts/release-github.sh` - wrapper around the reusable release skill for StartOS package releases.

## Maintenance expectations

- Match StartOS SDK patterns already used in this repository.
- Keep public package metadata pointed at this downstream repo, while preserving `upstreamRepo` as
  `rdouma/hashrate-autopilot`.
- Keep operator-facing copy concise and explicit about DRY-RUN mode, live bid risk, dependencies, and backups.
- Verify package builds after changing manifest, dependency, init, backup, Dockerfile, or Makefile behavior.

## Version and tag convention

StartOS package versions use ExVer `<upstream>:<downstream>`. StartOS Git tags use
`v{upstream}_{downstream}`: replace the ExVer colon with an underscore and do not prefix the package name. For
example, intended package version `1.17.4:0` maps to intended tag `v1.17.4_0`. Increment the downstream integer for
wrapper-only releases and reset it to `0` for a new upstream version.

Do not create or push a release tag merely to test packaging. A Start9-Community merge drives the official tag and
beta publication path.

## Official Community Registry path

The Community Registry path is separate from this repository's manual artifact and GitHub Release tooling:

1. For an initial submission, finish the submission checklist and email the public repository URL to
   `submissions@start9.com`.
2. Start9 creates a fork in the Start9-Community organization. Address feedback and open subsequent pull requests
   against that fork, not the original repository.
3. The fork's thin workflows call the official `Start9Labs/start-technologies` reusable workflows. A pull request
   runs the build workflow; a Start9 merge automatically builds, tags, and deploys to `community-beta`.
4. Test and soak the beta package. Request production promotion by email or an issue on the Community fork only
   after the beta gates pass.

Maintainers do not run local publish commands to place a package in the official Community Registry. Registry
credentials and signing configuration belong to the Start9-Community pipeline.

## Optional local/manual GitHub artifact path

The following tooling is an optional maintainer convenience for local packages or a separate GitHub draft release;
it is not the official Community Registry submission/promotion mechanism. It produces both architecture-specific
`.s9pk` files and a checksum file:

- `hashrate-autopilot-9_x86_64.s9pk`
- `hashrate-autopilot-9_aarch64.s9pk`
- `SHA256SUMS`

Use the release wrapper from the repo root:

```bash
pnpm run release:preflight
pnpm run release:artifacts
pnpm run release:checksums
pnpm run release:verify -- --local
```

The artifact build runs the clean release-input prebuild before packaging both architectures. After reviewing the
generated artifacts and notes, a separately authorized maintainer can run the full dry run and publish a draft
release. `release:github` runs a fresh dry-run before uploading local artifacts.

```bash
pnpm run release:dry-run
pnpm run release:github
pnpm run release:verify -- --download
```

The wrapper delegates to the reusable `publishing-github-releases` Codex skill. Override
`GITHUB_RELEASE_SKILL_DIR` only when testing a local copy of that skill.

This repository does not provide a separate manual CI artifact workflow. Its checked-in StartOS workflows are the
thin official Community Registry workflows; use the local/manual release profile and wrapper above for an expressly
authorized standalone GitHub draft release.

The SDK 2 Makefile's `make clean` target also deletes `node_modules`. The active local/manual release wrapper avoids
that broad cleanup and removes only the exact generated `.s9pk` artifact paths before rebuilding, preserving the
installed SDK include at `node_modules/@start9labs/start-sdk/s9pk.mk`. Reserve `make clean` for a deliberately clean
Task 9-style rebuild followed by dependency reinstallation.

## Expected warnings

These warnings are expected during release checks unless they become hard failures:

- Generated Lingui catalog eslint warnings.
- Vite chunk-size and plugin timing warnings.
- StartOS dependency metadata warnings for `bitcoind`, `datum`, and `electrs`.
- Fastify warnings emitted by exercised test/build paths.
- Full-lock audit advisories limited to build/development tooling; the daemon production-runtime audit is zero.
