# Updating Hashrate Autopilot

The manifest pins upstream's published image in `images.main.source.dockerTag` in
`startos/manifest/index.ts`.

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

2. Set the tag in `images.main.source.dockerTag`. Update the version and release notes in
   `startos/versions/current.ts` and the image reference in `README.md`.
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

4. Check the runtime and default TLS trust in the candidate image on each architecture. The
   package previously supplied fixes for Node and the distrusted emSign ECC Root CA - G3.
   This command exits unsuccessfully if the root is present or the trust store is empty.

   ```sh
   version=1.18.4
   arch=amd64  # Repeat with arm64.
   docker run --rm --network none --platform "linux/$arch" --entrypoint node \
     "ghcr.io/rdouma/hashrate-autopilot:$version" -e '
       const { X509Certificate } = require("node:crypto")
       const roots = require("node:tls").getCACertificates("default")
       console.log(process.version, roots.length)
       process.exitCode = Number(!roots.length || roots.some(pem =>
         new X509Certificate(pem).subject.includes("emSign ECC Root CA - G3")))
     '
   ```
