# Hashrate Autopilot StartOS Package

This repository is the downstream StartOS package for Hashrate Autopilot. It also retains the upstream application source so the StartOS image can be built locally. Keep the package ID `hashrate-autopilot-9` stable and treat `https://github.com/rdouma/hashrate-autopilot` as the upstream source.

## Working on the package

- Use `TODO.md` as the package worklist and `UPDATING.md` for upstream release bumps.
- Keep `README.md` and `instructions.md` synchronized with every change to package behavior, interfaces, dependencies, volumes, health checks, actions, or limitations.
- Preserve DRY-RUN as the safe first-run mode. Never create, edit, or cancel a live marketplace bid during automated testing.
- Run `npm run check`, `npm run check:startos-submission`, and the relevant `make` architecture target before release.
- Do not manually tag or publish a Community Registry release. Start9's merge automation owns the canonical tag, package build, and `community-beta` publication.

## Repository-specific conventions

Read `docs/agent-conventions.md` before changing issue state, changelog entries, build numbers, GitHub release behavior, or the Umbrel image pin. Those rules coexist with the StartOS Community pipeline and remain load-bearing for the upstream-compatible application paths retained here.
