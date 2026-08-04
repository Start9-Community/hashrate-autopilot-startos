# StartOS Community Registry Preparation Design

## Goal

Sync the downstream StartOS package with upstream Hashrate Autopilot `v1.17.4` and prepare the resulting `1.17.4:0` package for initial submission to the Start9 Community Registry.

## Starting Point

Use the existing clean `sync-upstream-v1.17.1` worktree as the integration base. It already contains the completed StartOS release-build optimizations and manual artifact workflow. Preserve upstream history by merging the `v1.17.4` tag with `--no-ff`.

Resolve conflicts by taking upstream application behavior, tests, generated data, and upstream documentation while preserving the downstream StartOS wrapper, package build path, service metadata, and operator guidance. Review every upstream change since `v1.17.1` for effects on persistent data, runtime configuration, dependencies, interfaces, health checks, backup behavior, and user instructions.

## Package Compliance

Bring the wrapper in line with the current StartOS 0.4 packaging conventions:

- Upgrade to the current stable `@start9labs/start-sdk` release supported by the official package template.
- Move version metadata to `startos/versions/current.ts` and `startos/versions/index.ts`.
- Set the package version to `1.17.4:0` and use the registry tag `v1.17.4_0`.
- Keep the package ID `hashrate-autopilot-9` and retain `x86_64` and `aarch64` image variants.
- Preserve the optimized StartOS-specific Docker build while adapting its Makefile integration to the current SDK conventions.
- Remove manifest fields retired by the current SDK and move documentation links into `instructions.md`.
- Retain the `main` volume, dashboard interface, health check, dependency declarations, backup hooks, and DRY-RUN-first safety posture unless the SDK upgrade proves that a declaration must change.

## Documentation

Rewrite `README.md` as a StartOS-specific package reference instead of duplicating upstream application documentation. It will include:

- a centered package icon and upstream documentation link;
- image source, architectures, and runtime entrypoint;
- volume and persistent-data layout;
- first-run and configuration ownership;
- network interface and port;
- StartOS actions, explicitly noting when none exist;
- backup and restore behavior;
- health checks;
- dependency requirements and purpose;
- limitations and differences from upstream;
- behavior unchanged from upstream;
- contributing link; and
- a machine-readable quick-reference block.

The README will contain no release versions, image tags, or dependency version constraints. Those belong in the manifest and version graph.

Rewrite `instructions.md` for an operator who has already installed the service. It will begin with stable documentation links, explain what the StartOS package provides, give the shortest first-run sequence from the dashboard setup wizard to a safe DRY-RUN state, and describe normal use and consequential limitations. It will not contain installation commands, package internals, hard-coded secrets, release versions, or generic StartOS platform instructions.

## Community Pipeline

Add the three Community Registry workflow entry points:

- `build.yml` for non-draft pull requests;
- `tagAndRelease.yml` for merges to the repository's default branch; and
- `release.yml` for StartOS version tags.

Start9's reusable workflows currently install dependencies with `npm ci`. Make the existing pnpm monorepo compatible by adding npm workspace metadata, npm-compatible internal workspace dependency ranges, and a committed `package-lock.json`. Retain `pnpm-lock.yaml` and the pnpm development path so upstream syncs remain straightforward. Both lockfiles must resolve the same declared dependency versions.

The upstream Docker publication job must ignore StartOS tags containing `_`. This prevents a tag such as `v1.17.4_0` from being interpreted as an upstream application release while allowing normal upstream tags such as `v1.17.4` to continue publishing Docker images.

The existing manual StartOS artifact workflow may remain as a maintainer convenience, but the Start9-Community fork's configured signing key, registry URLs, and storage credentials will be the only path that publishes to `community-beta`.

## Release Flow

1. Merge upstream `v1.17.4` into the isolated downstream integration branch.
2. Apply and verify the StartOS wrapper adaptations.
3. Run local application, package, documentation, and workflow checks.
4. Push the prepared public repository and email its URL to `submissions@start9.com`.
5. After Start9 creates the `Start9-Community` fork, open changes against that fork.
6. A pull request build verifies the package.
7. A Start9 merge checks version availability, creates `v1.17.4_0`, builds both architectures, creates the signed GitHub release, and publishes it to `community-beta`.
8. Test the beta package on StartOS.
9. Request production promotion by email or an issue on the community fork.

No email, GitHub push, release, registry publication, or production promotion is part of the local implementation without separate authorization.

## Failure Handling and Security

The pipeline must fail closed when:

- the package version already exists in the reference registry;
- either dependency installation path is not reproducible;
- typechecking, tests, or packaging fail;
- an expected architecture artifact is absent;
- manifest inspection does not match the intended ID, version, architecture, or SDK;
- required signing or registry configuration is unavailable in the community fork; or
- a StartOS tag could trigger the upstream Docker release path.

No signing keys, registry credentials, StartOS workspace configuration, runtime secrets, logs, databases, or diagnostic credentials will be committed. End-to-end validation stays in DRY-RUN and does not use a Braiins owner token or mutate a live marketplace bid.

## Verification

Run the following verification layers:

1. Git checks: clean/understood worktree, expected merge ancestry, `git diff --check`, and focused diffs for downstream wrapper files.
2. Dependency checks: clean `npm ci` and frozen pnpm installation.
3. Static and application checks: formatting, lint, `tsc --noEmit`, and the full test suite.
4. Package checks: build `x86_64` and `aarch64` `.s9pk` files and inspect each manifest for package ID, `1.17.4:0`, architecture, SDK version, release notes, dependencies, interfaces, and git hash.
5. Workflow checks: parse or lint all workflow YAML and demonstrate that StartOS tags bypass the upstream Docker publishing job.
6. Documentation checks: compare README and instructions against the current manifest, runtime, and official pre-publish checklists.
7. Physical StartOS checks: clean install, service start, dashboard load, green health check, uninstall/reinstall, and backup/restore. Record this as an explicit outstanding gate if no StartOS test device is reachable during implementation.

Prepare a submission checklist and email draft with the public repository URL and exact verification evidence. Do not represent the package as submission-ready until every locally executable check passes and the physical-device gate is clearly recorded.

## Out of Scope

- Changing upstream controller or dashboard product behavior beyond the `v1.17.4` merge.
- Enabling LIVE bidding or performing marketplace mutations.
- Publishing a Docker release for the StartOS wrapper revision.
- Sending the submission email, opening the community-fork PR, or requesting production promotion.
