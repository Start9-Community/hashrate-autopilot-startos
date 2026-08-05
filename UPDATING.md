# Updating Hashrate Autopilot

## Determining the upstream version

The application source is merged from `https://github.com/rdouma/hashrate-autopilot`; it is not a submodule or a prebuilt-image pin. Query the latest stable upstream release with:

```bash
gh release view --repo rdouma/hashrate-autopilot --json tagName,publishedAt,url
```

The currently packaged application version is `appVersion` in `startos/utils.ts`. The StartOS package version is `version` in `startos/versions/current.ts` and uses ExVer `<upstream>:<downstream>`.

## Applying an upstream bump

1. Fetch the upstream remote and its tags, then verify the selected release tag against the public upstream repository.
2. Merge the verified tag with `git merge --no-ff <tag>` so upstream history remains reviewable.
3. Resolve downstream conflicts without dropping StartOS integration, DRY-RUN safety, or the regular Docker and Umbrel paths.
4. Set `appVersion` in `startos/utils.ts` to the upstream version without the leading `v`.
5. Update `startos/versions/current.ts` in place. Set the upstream portion to the new release, reset the downstream revision to `0`, summarize user-relevant changes, and link the complete upstream release notes. Create a historical version file only when a migration requires it.
6. Synchronize the retained Umbrel version and image pin following `docs/agent-conventions.md`.
7. Update `CHANGELOG.md`, `README.md`, `instructions.md`, and the Community submission record when their documented behavior changes.
8. Run `npm ci`, `npm run check`, `npm run check:startos-submission`, SDK lint, and both package architecture builds. Inspect each `.s9pk` manifest and verify its checksum.

For a wrapper-only release, keep the upstream version unchanged and increment the downstream revision. Canonical StartOS tags replace the ExVer colon with an underscore: `v<upstream>_<downstream>`.
