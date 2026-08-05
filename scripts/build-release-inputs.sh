#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

app_version="$(sed -n "s/.*appVersion = '\([^']*\)'.*/\1/p" startos/utils.ts | head -1)"
if [ -z "$app_version" ]; then
    echo "Could not parse appVersion from startos/utils.ts" >&2
    exit 1
fi

git_sha="${GIT_SHA:-}"
if [ -z "$git_sha" ]; then
    git_sha="$(git rev-parse --short HEAD 2>/dev/null || true)"
fi
git_sha="${git_sha:-dev}"

# Prevent stale output contamination. The daemon build copies migrations
# into dist but does not delete removed or renamed migration files first.
rm -rf packages/*/dist javascript

export APP_VERSION="$app_version"
export GIT_SHA="$git_sha"

npm run build --workspace @hashrate-autopilot/shared
npm run build --workspace @hashrate-autopilot/bitcoind-client
npm run build --workspace @hashrate-autopilot/braiins-client
npm run build --workspace @hashrate-autopilot/dashboard
npm run build --workspace @hashrate-autopilot/daemon
npm run build:startos
