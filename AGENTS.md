# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

**Start every task at the recipe index** — `../start-technologies/projects/start-sdk/docs/src/recipes.md`
(or <https://docs.start9.com/packaging/recipes.html>). It maps an intent ("prompt the user to create
admin credentials", "expose a web UI") to the constructs, the reference pages, and a named production
package to copy. Find the recipe before you read this package's neighbours: a package you reach by
grepping may be non-conformant, and the recipe outranks it.

Freshly scaffolded? Work the
[New Package Checklist](../start-technologies/projects/start-sdk/docs/src/new-package-checklist.md)
(or <https://docs.start9.com/packaging/new-package-checklist.html>) from top to bottom. It is a
guide page, not a file in this repo — read it, don't copy it in.

Keep `README.md` (technical reference for an AI support or administering agent) and
`instructions.md` (end-user docs) in sync with your changes.

**Bugs and feature requests are GitHub issues on this repo** — file them as you find them.
Don't record work in the repo instead: no `TODO.md`, no `NOTES.md`, no `PLAN.md`. What you
verified, tried, and decided belongs in the commit message and the PR body.

## This repo

- **This is a fork of the upstream application, not a wrapper around a released image.** `packages/`, `scripts/`, `docs/` (except the StartOS pages), `Dockerfile`, `rdouma-hashrate-autopilot/`, `umbrel-app-store.yml`, `CHANGELOG.md`, `FAQ.md` and `SECURITY.md` are upstream's and are merged in from <https://github.com/rdouma/hashrate-autopilot>. Don't restructure or delete them: an upstream bump is a `git merge`, and anything moved here becomes a conflict on every sync. The StartOS surface is `startos/`, `Dockerfile.startos`, `Makefile`, `tsconfig.json`, `icon.png`, and the four package docs. `UPDATING.md` has the merge procedure.
- **`make` builds the application, not just the bundle.** `s9pk.mk` calls `npm run build`, which this repo points at `scripts/build-release-inputs.sh` — it compiles every workspace `dist/` and *then* runs ncc. `Dockerfile.startos` copies those `dist/` directories, which are gitignored, so nothing but that script makes a clean checkout buildable. Don't repoint the root `build` script.
- **Keep `@types/node` on the major the runtime actually is.** Upstream floats it to `^26.x` while `.nvmrc` and `engines` say 22; that types-vs-runtime gap is invisible in the app but breaks the sibling `*-startos` sources this package's `tsconfig.json` type-checks (`fs.rmdir`'s options parameter is gone in the 26 types). Hold it at `^22.x` through every upstream merge.
- **Three things an upstream merge will try to take back, all of them fork-only.** `linkWorkspacePackages: true` in `pnpm-workspace.yaml` — the StartOS build runs `npm ci`, so this fork rewrites every `workspace:*` to `*`, and pnpm only links a bare `*` to a workspace package with that flag on; resolving that file with `--theirs` drops it and `pnpm install` then goes to the registry for `@hashrate-autopilot/*` and fails. The `*` protocol itself in each `packages/*/package.json`. And `@types/node` above. Take upstream's side on everything else in those files.
- **Both lockfiles have to be regenerated after a merge, and they drift.** `npm install` resolves patch versions freshly while pnpm keeps whatever the merged lockfile already had, so `check:lock-consistency` fails on a handful of packages; `pnpm update -r --lockfile-only <pkg>...` pulls pnpm up to match. Keep the npm `overrides` in `package.json` mirroring the pnpm `overrides` in `pnpm-workspace.yaml` — npm expresses pnpm's scoped `"minimatch@5>brace-expansion"` as a nested `"minimatch@5": { "brace-expansion": … }`.
- **bitcoind's RPC credentials come from its cookie, not from the operator.** `main.ts` mounts bitcoind's volume read-only, reads `.cookie`, and splits it into `BHA_BITCOIND_RPC_USER` / `BHA_BITCOIND_RPC_PASSWORD`. The read is reactive, so a cookie rotated on bitcoind's restart restarts the daemon with the new one. Don't ask the operator to paste RPC credentials into the dashboard.
- **All three dependencies are required, so an unresolved address throws.** Omitting the environment variable instead would start a daemon that reports no chain tip, no payouts and no pool statistics — a silent failure that looks like an application bug.
- **Import each dependency's host id and port from its own package** (`bitcoin-core-startos`, `electrs-startos`, `datum-gateway-startos`), so a change on their side is a build failure here rather than a silent misconnection.
- **`docs/agent-conventions.md` describes the upstream project's own release process** — its GHCR image pins, Umbrel manifest, issue labels and `data/diagnostics.json` credential file. None of it governs this repo: StartOS releases are cut by the reusable CI in `.github/workflows/`, and nothing here should read an operator credential file.
- **Default branch is `main`, not `master`.** Its CI workflows reference `main`; leave them.

## Inspecting a running install

`start-cli package attach hashrate-autopilot -n hashrate-autopilot-sub -- <cmd>` — the package runs one subcontainer, named `hashrate-autopilot-sub`.
