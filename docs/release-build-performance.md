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
