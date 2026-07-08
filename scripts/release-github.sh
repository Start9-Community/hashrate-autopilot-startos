#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROFILE="${RELEASE_PROFILE:-.github/release-profile.env}"
SKILL_DIR="${GITHUB_RELEASE_SKILL_DIR:-${CODEX_HOME:-$HOME/.codex}/skills/publishing-github-releases}"

usage() {
    cat <<'EOF'
Usage: scripts/release-github.sh <command> [publish-options]

Commands:
  preflight   Inspect git/GitHub release readiness
  build       Run checks and build release artifacts
  checksums   Generate SHA256SUMS for release artifacts
  dry-run     Run preflight, build, checksums, and local verification
  publish     Upload artifacts to GitHub Release, draft by default
  verify      Verify local checksums and GitHub release metadata
  release     Run dry-run, publish, then verify

Publish options passed to the skill publish script:
  --draft       Create a draft release (default)
  --publish     Create a public release
  --prerelease  Mark the release as prerelease
  --clobber     Replace existing release assets
EOF
}

run_skill() {
    local script="$1"
    shift

    if [ ! -x "$SKILL_DIR/scripts/$script" ]; then
        echo "GitHub release skill script not found: $SKILL_DIR/scripts/$script" >&2
        echo "Install or create the publishing-github-releases skill first." >&2
        exit 1
    fi

    RELEASE_PROFILE="$PROFILE" "$SKILL_DIR/scripts/$script" "$@"
}

command="${1:-help}"
if [ "$#" -gt 0 ]; then
    shift
fi
if [ "${1:-}" = "--" ]; then
    shift
fi

case "$command" in
    preflight)
        run_skill preflight.sh
        ;;
    build)
        run_skill build-artifacts.sh
        ;;
    checksums)
        run_skill make-checksums.sh
        ;;
    dry-run)
        run_skill preflight.sh
        run_skill build-artifacts.sh
        run_skill make-checksums.sh
        run_skill verify-release.sh --local
        ;;
    publish)
        run_skill publish-release.sh "$@"
        ;;
    verify)
        run_skill verify-release.sh "$@"
        ;;
    release)
        run_skill preflight.sh
        run_skill build-artifacts.sh
        run_skill make-checksums.sh
        run_skill verify-release.sh --local
        run_skill publish-release.sh "$@"
        run_skill verify-release.sh
        ;;
    help|-h|--help)
        usage
        ;;
    *)
        echo "Unknown command: $command" >&2
        usage >&2
        exit 1
        ;;
esac
