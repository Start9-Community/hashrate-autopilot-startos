# Upstream Deployment References

This StartOS fork maintains the `.s9pk` packaging flow. For Docker, bare-metal Node, Umbrel, and SOPS-first
deployments, prefer the upstream project unless you are intentionally testing this fork outside StartOS.

## Docker

Use the upstream image:

```bash
docker run -d \
  --name hashrate-autopilot \
  -p 3010:3010 \
  -v hashrate-autopilot-data:/app/data \
  --restart unless-stopped \
  ghcr.io/rdouma/hashrate-autopilot:latest
```

Pin production installs to a tagged upstream release instead of `latest` when possible. The named volume stores
configuration, secrets, tick history, and bid history under `/app/data`.

## Bare-Metal Node

Use Node 22+ and pnpm 10+, then follow the upstream source checkout flow:

```bash
git clone https://github.com/rdouma/hashrate-autopilot
cd hashrate-autopilot
pnpm install
pnpm build
./scripts/start.sh
```

The dashboard listens on port `3010` by default.

## SOPS Setup

The upstream project also supports a power-user setup flow that stores secrets in `.env.sops.yaml`:

```bash
pnpm run setup
```

Use this only when you want to manage secrets with `sops` and `age` instead of the first-run web wizard.

## Upstream Links

- Upstream repository: <https://github.com/rdouma/hashrate-autopilot>
- Upstream releases: <https://github.com/rdouma/hashrate-autopilot/releases>
- This StartOS fork: <https://github.com/Start9-Community/hashrate-autopilot-startos>
