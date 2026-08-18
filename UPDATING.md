# Updating Hashrate Autopilot

This repository is a **fork of the upstream application**, not a wrapper around a released image, so
an upstream bump is a merge rather than a tag change. The packaged application version is `appVersion`
in `startos/utils.ts`; the StartOS package version is `version` in `startos/versions/current.ts`, in
ExVer `<upstream>:<downstream>`.

## Determining the upstream version

```sh
gh release view --repo rdouma/hashrate-autopilot --json tagName,publishedAt,url
```

## Applying an upstream bump

1. Fetch the upstream remote and its tags, and verify the release tag against the public upstream
   repository.
2. Merge it with `git merge --no-ff <tag>` so upstream history stays reviewable.
3. Resolve conflicts without dropping the StartOS integration or DRY-RUN as the first-run mode. The
   files that are ours are `startos/`, `Dockerfile.startos`, `Makefile`, `tsconfig.json`, `icon.png`,
   `instructions.md`, `UPDATING.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, and the
   StartOS workflows; everything else is upstream's and should take upstream's side.
4. Set `appVersion` in `startos/utils.ts` to the upstream version without the leading `v`.
   `scripts/build-release-inputs.sh` parses that line, and the manifest passes it to the image build,
   so keep its shape.
5. Update `startos/versions/current.ts`: the upstream portion of `version`, the downstream revision
   reset to `0`, and `releaseNotes` rewritten in all five locales, summarizing what changes for the
   operator. Only spin off a historical version file when a migration must run in sequence.
6. Review what the merge changed in the application's own configuration surface, because the package
   asserts part of it on every start. In particular: the `BHA_*` names in
   `packages/daemon/src/config/env-overrides.ts` (a rename there is not a type error — the daemon
   starts anyway, on defaults), the resolution order `env > db > defaults`, and the container paths
   `Dockerfile.startos` copies.
7. Merge it on its own. The diff is large and stays reviewable only if nothing else rides along.

For a wrapper-only release, leave the upstream version alone and increment the downstream revision.

## Verification

```sh
npm ci
npm run check      # lock consistency, lint, typecheck, and the app's own test suite
make x86
make arm
```

`make` runs `npm run check` and the SDK lint on its own before packing, so a green `make` covers the
first three. Then install on a StartOS server with Bitcoin, Electrs and Datum Gateway present and
synced, and confirm the daemon starts, the health check goes green, and the dashboard serves its
setup wizard.

Before tagging a release that an operator will run LIVE, drive a real bid end to end against a funded
Braiins account — the health check only proves the dashboard is answering.

Tags are `v<upstream>_<downstream>`. Don't create or push one by hand: a merge to `main` in the
Start9-Community fork drives the tag, the build, and the `community-beta` deploy.
