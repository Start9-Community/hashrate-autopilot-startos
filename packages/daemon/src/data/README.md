# Bundled data

## `pools-v2.json`

Curated Bitcoin mining-pool identification database - maps coinbase
output addresses and coinbase-tag substrings to canonical pool names
(e.g. "Foundry USA", "Luxor", "MARA Pool"). Used by
`services/coinbase-pools.ts` to name the pool that mined the chain tip
for the "block height" dashboard tile (#335), the same way every block
explorer does.

- **Source:** https://github.com/mempool/mining-pools (`pools-v2.json`).
- **Format:** a flat JSON array of `{ id, name, addresses[], tags[], link }`.
- **Refresh:** occasionally re-fetch from upstream and drop it in place -
  new pools and rotated addresses appear there first. No code change is
  needed; the loader reads whatever shape matches the interface.

The build step copies this file to `dist/data/` so it ships in the
Docker image (see `package.json`'s `build` script).
