-- #323: earnpay-based payout tracking. Ocean's /v1/earnpay endpoint
-- returns the authoritative list of settlements (payouts[]) for an
-- address, covering BOTH on-chain payouts (on_chain_txid present) AND
-- Lightning payouts (on_chain_txid null, never touch the chain). This
-- table is the persistent store of that list and becomes the source of
-- truth for lifetime "collected" in the P&L panel - replacing the
-- on-chain-only reward_events derivation, which by construction cannot
-- see Lightning payouts and so understated net P&L for anyone paid over
-- Lightning.
--
-- The legacy on-chain scanner (payout-observer -> reward_events) keeps
-- running as a silent corroboration/debug aid; it no longer feeds P&L.
--
-- `address` is stored per-row so a payout-address change is handled by
-- re-backfilling the new address and scoping the P&L sum to the current
-- address - no destructive delete needed. Old-address rows sit
-- harmlessly.
--
-- `dedup_key` is the idempotency key for INSERT ... ON CONFLICT DO
-- NOTHING. It embeds the address plus either the txid (on-chain) or a
-- synthetic ts+amount tuple (Lightning, which has no txid). A plain
-- UNIQUE(address, on_chain_txid) index would NOT dedup Lightning rows
-- because SQLite treats NULLs as distinct in unique indexes.
CREATE TABLE ocean_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  ts INTEGER NOT NULL,                 -- settlement time, ms epoch
  on_chain_txid TEXT,                  -- null = Lightning (off-chain)
  net_sat INTEGER NOT NULL,            -- total_satoshis_net_paid
  is_generation INTEGER NOT NULL DEFAULT 0,  -- 1 = coinbase-direct
  rail TEXT NOT NULL,                  -- 'onchain' | 'lightning'
  dedup_key TEXT NOT NULL,
  enriched_alert INTEGER NOT NULL DEFAULT 0, -- 1 = stage-2 alert sent
  first_seen_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_ocean_payouts_dedup ON ocean_payouts(dedup_key);
CREATE INDEX idx_ocean_payouts_addr_ts ON ocean_payouts(address, ts);
