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

- **The package id is `hashrate-autopilot-9`; keep it stable.** Upstream is <https://github.com/rdouma/hashrate-autopilot>, whose application source is retained here so the StartOS image can be built locally.

## Working on the package

- Use `UPDATING.md` for upstream release bumps, and this repo's GitHub issues for pending work.
- Keep `README.md` and `instructions.md` synchronized with every change to package behavior, interfaces, dependencies, volumes, health checks, actions, or limitations.
- Preserve DRY-RUN as the safe first-run mode. Never create, edit, or cancel a live marketplace bid during automated testing.
- Run `npm run check`, `npm run check:startos-submission`, and the relevant `make` architecture target before release.
- Do not manually tag or publish a Community Registry release. Start9's merge automation owns the canonical tag, package build, and `community-beta` publication.

## Repository-specific conventions

Read `docs/agent-conventions.md` before changing issue state, changelog entries, build numbers, GitHub release behavior, or the Umbrel image pin. Those rules coexist with the StartOS Community pipeline and remain load-bearing for the upstream-compatible application paths retained here.
