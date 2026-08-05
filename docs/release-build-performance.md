# Release Build Performance

## Method

Baseline timings were captured with `/usr/bin/time -p <command>` on this host:

- Architecture: `x86_64`
- OS/kernel: `Linux 6.17.0-19-generic x86_64 GNU/Linux`
- CPU: 2 CPUs, `AMD A6-9220 RADEON R4, 5 COMPUTE CORES 2C+3G`
- Memory: 15Gi total
- Docker: `Docker version 27.1.1, build 6312585`
- Docker buildx: `github.com/docker/buildx v0.16.1 34c1952`
- start-cli: `start-cli 0.4.0-alpha.21`
- pnpm: `10.33.0`
- Cache state: run after `pnpm install --frozen-lockfile` and a prior baseline check; Docker cache was not purged.

## Baseline

- Date: 2026-07-05
- Commit: 51c8c4684f5c46d8c9dec8a50bb84ac3ea10878c
- `pnpm run check`: real 265.02s, user 222.51s, sys 20.41s
- `make clean`: real 2.44s, user 0.96s, sys 0.18s
- `make x86`: real 1019.53s, user 263.94s, sys 20.56s
- `make arm`: real 3124.61s, user 225.73s, sys 20.11s

## Package Manifests

| Package | Version | Git hash | SDK | Arches |
| --- | --- | --- | --- | --- |
| `hashrate-autopilot-9_x86_64.s9pk` | `1.16.0:0` | `51c8c4684f5c46d8c9dec8a50bb84ac3ea10878c` | `0.4.0-beta.62` | `x86_64` |
| `hashrate-autopilot-9_aarch64.s9pk` | `1.16.0:0` | `51c8c4684f5c46d8c9dec8a50bb84ac3ea10878c` | `0.4.0-beta.62` | `aarch64` |

## Known Bottleneck

The StartOS package path currently compiles TypeScript, Lingui, Vite, and daemon output inside each architecture-specific Docker build. On this baseline host/environment, the aarch64 build runs those same architecture-independent steps under QEMU.

## Optimized StartOS Path

- Date: 2026-07-08
- Commit: 490871ce9142896c847ed93e211809ecf5759f81
- `pnpm install --frozen-lockfile`: real 4.70s, user 3.53s, sys 0.50s
- `pnpm run check`: real 233.15s, user 216.33s, sys 19.52s
- `pnpm run build`: real 101.39s, user 111.26s, sys 5.39s
- `make clean`: real 1.00s, user 0.76s, sys 0.20s
- `pnpm run build:release-inputs`: real 127.94s, user 136.58s, sys 7.54s
- `make x86`: real 365.84s, user 237.89s, sys 18.32s
- `make arm`: real 485.40s, user 239.84s, sys 19.43s
- `pnpm run release:artifacts`: real 1270.25s, user 845.56s, sys 66.53s
- `pnpm run release:checksums`: real 2.64s, user 1.64s, sys 0.28s
- `./scripts/release-github.sh verify --local`: real 0.99s, user 0.83s, sys 0.12s

### Optimized Package Manifests

| Package | Version | Git hash | SDK | Arches |
| --- | --- | --- | --- | --- |
| `hashrate-autopilot-9_x86_64.s9pk` | `1.16.0:0` | `490871ce9142896c847ed93e211809ecf5759f81` | `0.4.0-beta.62` | `x86_64` |
| `hashrate-autopilot-9_aarch64.s9pk` | `1.16.0:0` | `490871ce9142896c847ed93e211809ecf5759f81` | `0.4.0-beta.62` | `aarch64` |

### Improvement

Baseline package builds took `make x86` + `make arm` = 4144.14s. The optimized package path took `build:release-inputs` + `make x86` + `make arm` = 979.18s, a 3164.96s reduction, about 76% faster on this host.

In the final timed package runs, the architecture-specific Docker `pnpm install --prod` layers were cache hits for both x86_64 and aarch64. No TypeScript, Lingui, Vite, or daemon compilation ran inside the package Docker builds; those steps ran once in `build:release-inputs`.

ARM packaging still spends meaningful time in image export and `.s9pk` squash/sign steps. If CI timing shows QEMU remains the dominant cost, the next follow-up is a two-job workflow: x86 on `ubuntu-latest`, ARM on `ubuntu-24.04-arm`, and a fan-in job that downloads both artifacts, creates `SHA256SUMS`, verifies checksums, and uploads the final bundle.
