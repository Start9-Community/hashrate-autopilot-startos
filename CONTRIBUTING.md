# Contributing

Hashrate Autopilot for StartOS is a downstream packaging fork of
[`rdouma/hashrate-autopilot`](https://github.com/rdouma/hashrate-autopilot). Contributions are welcome when they are
focused, reproducible, and aligned with the repository scope.

## Repository scope

This repository maintains:

- The StartOS package wrapper, manifest, dependency declarations, backup hooks, and `.s9pk` build flow.
- Downstream documentation for building, sideloading, and operating Hashrate Autopilot on StartOS.
- Minimal downstream fixes needed to keep the upstream application buildable and runnable as a StartOS service.

The upstream project remains the source of truth for general Docker, bare-metal, and Umbrel application behavior.
Changes that are not StartOS-specific should be proposed upstream first whenever practical.

## Before opening a PR

For small documentation fixes, typo corrections, or narrowly scoped package fixes, open a PR directly. For larger
changes, open an issue or discussion first so scope and upstream impact are clear before implementation.

## Changes likely to be accepted

- StartOS packaging fixes with clear reproduction steps.
- Documentation improvements that make installation, sideloading, backup, restore, or dependency setup clearer.
- Tests or build checks for downstream packaging behavior.
- Carefully scoped upstream sync fixes that preserve local StartOS integration.

## Changes that need extra review

- Any change to payout addresses, fee handling, withdrawal-adjacent behavior, or bid mutation logic.
- Large refactors that are not required for a concrete packaging or operator-facing improvement.
- Application behavior changes that should be reviewed in the upstream repository first.

## Development setup

```bash
# Prerequisites: Node 22+, pnpm 10+, StartOS start-cli for package builds
git clone https://github.com/mdubore/hashrate-autopilot-startos.git
cd hashrate-autopilot-startos
pnpm install
```

Useful commands:

- `pnpm test` - run the application test suite.
- `pnpm typecheck` - typecheck all packages.
- `pnpm build` - build all workspace packages.
- `pnpm --filter @hashrate-autopilot/dashboard run lingui:extract` - update dashboard translation catalogs.
- `make x86` - build the x86_64 StartOS package.
- `make arm` - build the aarch64 StartOS package.

Read `docs/spec.md` before changing controller behavior. Read `docs/architecture.md` before changing the daemon,
dashboard, persistence model, or package runtime. Read `docs/configuration.md` before changing setup defaults or
environment variable handling.

## Upstream sync policy

Keep downstream changes easy to review against upstream:

- Prefer small, focused commits.
- Preserve upstream files when no StartOS-specific change is required.
- Document any local divergence in the commit message or PR description.
- After syncing an upstream release, verify the application tests and at least one StartOS package build target.

## Commit and PR style

- Use short, imperative commit subjects. Conventional prefixes such as `docs:`, `fix:`, and `chore:` are preferred.
- Keep each commit to one logical change when practical.
- PR descriptions should explain what changed, why it changed, and exactly how it was tested.
- Link related issues or upstream release notes when relevant.

## License

By contributing, you agree your changes are released under the repository's MIT license. A `Signed-off-by:` line is
welcome but not required.
