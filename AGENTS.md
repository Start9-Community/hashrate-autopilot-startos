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

- **The image is upstream's published build, pinned in the manifest.** `images.main.source.dockerTag` points at `ghcr.io/rdouma/hashrate-autopilot`; nothing is compiled here. An upstream bump is a tag change — `UPDATING.md` has the procedure. Don't add a `Dockerfile` or vendor the application's source: the packaging guide's Project Structure page states why.
- **bitcoind's RPC credentials come from its cookie, not from the operator.** `main.ts` mounts bitcoind's volume read-only, reads `.cookie`, and splits it into `BHA_BITCOIND_RPC_USER` / `BHA_BITCOIND_RPC_PASSWORD`. The read is reactive, so a cookie rotated on bitcoind's restart restarts the daemon with the new one. Don't ask the operator to paste RPC credentials into the dashboard.
- **All three dependencies are required, so an unresolved address throws.** Omitting the environment variable instead would start a daemon that reports no chain tip, no payouts and no pool statistics — a silent failure that looks like an application bug.
- **Import each dependency's host id and port from its own package** (`bitcoin-core-startos`, `electrs-startos`, `datum-gateway-startos`), so a change on their side is a build failure here rather than a silent misconnection.

## Inspecting a running install

`start-cli package attach hashrate-autopilot -n hashrate-autopilot-sub -- <cmd>` — the package runs one subcontainer, named `hashrate-autopilot-sub`.
