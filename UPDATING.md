# Updating Hashrate Autopilot

This package wraps upstream's own published image with temporary CA-store and Node layers in the root
`Dockerfile`. The packaged application version is the tag in
`images.main.source.dockerBuild.buildArgs.IMAGE` (`startos/manifest/index.ts`).

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

2. Set the tag in `images.main.source.dockerBuild.buildArgs.IMAGE`.
3. Review what the release changed in the application's own configuration surface, because the
   package asserts part of it on every start. In particular: the `BHA_*` names in
   `packages/daemon/src/config/env-overrides.ts` in the upstream repo (a rename there is not a
   type error — the daemon starts anyway, on defaults), the resolution order `env > db > defaults`,
   and the image's own `Volumes`, `ExposedPorts` and `Env`, which `startos/main.ts` and
   `startos/utils.ts` mirror:

   ```sh
   docker image inspect ghcr.io/rdouma/hashrate-autopilot:<version> \
     --format '{{json .Config}}' | jq '{Cmd, WorkingDir, ExposedPorts, Volumes, Env}'
   ```

## Removing the temporary layers

Both layers come out together, once an upstream image ships Node 22.23.4 or later (its
`NODE_VERSION`). Verify that its default TLS trust also excludes emSign ECC Root CA - G3. Then
remove the root `Dockerfile`, switch
`images.main.source` back to `{ dockerTag: '<verified upstream image:tag>' }`, and update
`README.md`, `AGENTS.md`, and this procedure to match.
