# Updating Hashrate Autopilot

This package wraps upstream's own published image, so an upstream bump is a tag change — there is
nothing to compile here. The packaged application version is the tag in
`images.main.source.dockerTag` (`startos/manifest/index.ts`); the StartOS package version is
`version` in `startos/versions/current.ts`, in ExVer `<upstream>:<downstream>`.

## Determining the upstream version

```sh
gh release view --repo rdouma/hashrate-autopilot --json tagName,publishedAt,url
```

## Applying an upstream bump

1. Confirm the tag is published **and multi-arch** before pinning it. StartOS needs both `x86_64`
   and `aarch64`; a tag that only ships `amd64` cannot be packaged.

   ```sh
   docker manifest inspect ghcr.io/rdouma/hashrate-autopilot:<version> \
     | jq -r '.manifests[].platform.architecture'
   ```

2. Set the tag in `images.main.source.dockerTag`, and the upstream portion of `version` in
   `startos/versions/current.ts` with the downstream revision reset to `0`.
3. Rewrite `releaseNotes` in all five locales, summarizing what changes for the operator.
4. Review what the release changed in the application's own configuration surface, because the
   package asserts part of it on every start. In particular: the `BHA_*` names in
   `packages/daemon/src/config/env-overrides.ts` in the upstream repo (a rename there is not a
   type error — the daemon starts anyway, on defaults), the resolution order `env > db > defaults`,
   and the image's own `Volumes`, `ExposedPorts` and `Env`, which `startos/main.ts` and
   `startos/utils.ts` mirror:

   ```sh
   docker image inspect ghcr.io/rdouma/hashrate-autopilot:<version> \
     --format '{{json .Config}}' | jq '{Cmd, WorkingDir, ExposedPorts, Volumes, Env}'
   ```

5. Only spin off a historical version file when a migration must run in sequence.

For a packaging-only release, leave the upstream version alone and increment the downstream revision.

## Verification

```sh
npm ci
make javascript/index.js   # type-check, tests, lint, format check, bundle
make x86
make arm
```

Then install on a StartOS server with Bitcoin, Electrs and Datum Gateway present and synced, and
confirm the daemon starts, the Dashboard health check goes green, and the dashboard serves its setup wizard (the Setup check stays failing until the wizard is completed).

Before tagging a release an operator will run LIVE, drive a real bid end to end against a funded
Braiins account — the health check only proves the dashboard is answering.

Tags are `v<upstream>_<downstream>`. Don't create or push one by hand: a merge to `master` drives the
tag, the build, and the `community-beta` deploy.
