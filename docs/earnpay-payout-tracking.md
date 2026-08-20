# earnpay-based payout tracking (Lightning-inclusive P&L)

Status: **implemented** on `develop` (build 761, 2026-07-05). Shipped in
commits: ocean_payouts store + earnpay client + service; finance/P&L
rewire + rail split; rail-aware stage-2 payout_confirmed alert; chart
gems from `/api/payout-ledger`. Migration 0116.
Related: issue #323 ("Lightning Payouts Show as On-Chain Payouts"), #240 (collected = lifetime received), #170 (historical offset).

> **#343 amendment (build 799, 2026-07-15): earnpay does NOT return
> Lightning payouts.** This doc's core assumption - that earnpay rows
> with `on_chain_txid: null` are Lightning settlements - turned out to
> be false in practice: a Lightning-paid user's earnpay history
> contained only their on-chain payout, and Ocean support confirmed
> "there are no ways to fetch the lightning payouts for the OCEAN API
> at the moment. The API is still in beta and will evolve to include
> such information." The `rail: 'lightning'` plumbing below stays
> correct and forward-compatible; the missing rows are now supplied by
> the **DeducedPayoutsScanner** (`services/deduced-payouts.ts`,
> migration 0120 adds `ocean_payouts.deduced`): a confirmed drop of
> `tick_metrics.ocean_unpaid_sat` to ~zero (>30% drop, residual below
> the payout threshold, two consecutive low ticks) with no earnpay
> settlement matching within ±24h / ±25% amount is inserted as a
> deduced payout - rail `'unknown'` inside the 24h correction window,
> `'lightning'` by elimination after it, superseded (deleted) whenever
> a matching real settlement appears. Full-history passes retro-fill
> old drops and re-derive deduced rows after a hard reset. See
> `docs/spec.md` §P&L and the scanner's module docblock for details.

## Problem

P&L "collected" is derived from the on-chain payout-address scanner
(`payout-observer` -> `reward_events` -> `finance.ts`
`rewardEventsRepo.sumPaidUpTo`). That scanner can only see money that
lands on-chain. Ocean supports **Lightning payouts** (BOLT12, per-block
cadence, no on-chain footprint). When Ocean settles a balance over
Lightning:

- `statsnap.unpaid_sat` drops (Ocean debited the operator), so
  `expected_sat` falls, but
- nothing lands on the payout address, so `collected_sat` does not rise.

Result: `net = collected + offset + expected − spent` **understates**
by the full Lightning payout amount. P&L silently drifts wrong for any
operator on Lightning. This is the core reason to build the feature -
P&L correctness, not cosmetics.

## Source of truth: `earnpay`

`GET /v1/earnpay/<addr>/<yyyy-mm-dd>/<yyyy-mm-dd>` returns, per address:

- `earnings[]` - per-block credits that accumulate into unpaid balance
  (not needed for this feature).
- `payouts[]` - **actual settlements**, each:
  - `ts` - settlement time
  - `on_chain_txid` - present = on-chain, `null` = **Lightning**
  - `total_satoshis_net_paid` - net sat that actually reached the operator
  - `is_generation_txn` - `true` = coinbase-direct, `false` = batched sweep

`payouts[]` is a **superset** of what the on-chain scanner can see: it
carries both on-chain and Lightning settlements with rail, amount, and
(for on-chain) txid. It is therefore authoritative for "what Ocean
actually paid me."

Empirical facts (operator address, verified 2026-07-04):
- No date params -> ~30-day default window (this is why the operator saw
  only 4 payouts).
- Wide range `/2020-01-01/<future>` -> full history (9 payouts, all
  on-chain for this operator).
- No auth; per-address; public. Politeness budget per the ocean-pool
  skill: 30-60s poll floor, one call, back off on 429.

## Decisions (from the spec interview, 2026-07-05)

1. **earnpay is the source of truth.** `earnpay.payouts` drives
   `collected` entirely (on-chain + Lightning). The on-chain
   `payout-observer` keeps running but **no longer feeds P&L** - it is
   retained only as a silent corroboration/debug aid.

2. **Always-on, no config switch.** No "trust Ocean vs on-chain"
   toggle. The feature needs no Lightning node and helps every operator,
   so it is simply how the daemon works now. One accounting code path.

3. **Chart gems come from earnpay.** Every payout gets a gem:
   - on-chain -> diamond gem + explorer link (via `on_chain_txid`),
   - Lightning -> gem with **no** link; tooltip states "Lightning
     payout (off-chain)".
   Single visual style; the tooltip distinguishes rail. Retires the
   `reward_events`-sourced gems.

4. **Two-stage alerts (instant + enrich).** Keep the instant
   `statsnap.unpaid_sat`-drop alert as the prompt heads-up ("Ocean
   debited ~X sat"). When earnpay catches up, fire a **second enriched
   message**: "Confirmed: X sat via Lightning" or "via on-chain, txid
   ...". This restores the old initiated/confirmed rhythm and now works
   for Lightning too.

5. **P&L shows the on-chain vs Lightning split.** "Collected" gains a
   small breakdown (e.g. "Collected 0.093 BTC - 0.081 on-chain, 0.012
   Lightning") in the P&L / payouts view. Not a full new ledger table;
   an aggregate split plus per-payout detail in gem tooltips.

6. **Manual offset left untouched on upgrade.** Migration does **not**
   modify `historical_payouts_offset_sat`. A one-time dashboard notice
   explains that earnpay now drives `collected` and that an existing
   offset (previously used to correct the on-chain scanner) may now
   double-count and can be reviewed/zeroed by the operator.

7. **Always backfill from the beginning.** On enable / first run of the
   new version (and whenever the payout store is empty), fetch the full
   history with a wide date range. Steady state refreshes incrementally
   (see below).

## Mechanical design (implementer's call, recorded here)

### Storage

New table `ocean_payouts` (new migration; append it to
`db.test.ts`'s expected-migration list in the same commit):

| column           | type    | notes                                        |
|------------------|---------|----------------------------------------------|
| `ts`             | INTEGER | settlement time (ms)                         |
| `on_chain_txid`  | TEXT    | nullable; `null` = Lightning                 |
| `net_sat`        | INTEGER | `total_satoshis_net_paid`                    |
| `is_generation`  | INTEGER | `is_generation_txn` (0/1)                     |
| `rail`           | TEXT    | derived: `'onchain'` \| `'lightning'`        |
| `enriched_alert` | INTEGER | 0/1 - has the stage-2 alert been sent        |

Identity / upsert key:
- on-chain payout -> `on_chain_txid` (unique, stable).
- Lightning payout (null txid) -> synthetic key `('ln', ts, net_sat)`.
Upsert semantics so a re-fetched window never duplicates rows and a
later fetch can fill a previously-missing txid.

### Fetch cadence

- **Full backfill**: fetch `/2020-01-01/<today+1d>` and upsert all
  payouts. Runs on **every boot** and then **periodically** (~24 h), not
  just once when `ocean_payouts` is empty. This is the #343 self-heal:
  the original "backfill once when empty" left `collected` permanently
  short if that single fetch came back partial (a transient Ocean hiccup
  during an upgrade would do it - one operator's collected stayed ~758k
  sat low, inflating his loss rate from ~7% to ~32%). A full earnpay
  fetch returns the complete history and re-storing rows you already have
  is a no-op (`ON CONFLICT DO NOTHING`), so re-running it is safe and
  fills any gap. Rows pulled by a backfill are marked already-notified so
  the re-pull never re-alerts on old payouts.
- **Steady state**: a daemon-internal refresher (per the
  "daemon drives every metric refresh" rule - never a dashboard poll)
  re-fetches a recent trailing window (e.g. last 60 days) on a slow
  cadence (~5 min). Upsert. This catches new payouts and late-populated
  txids without re-pulling full history each tick.
- **Manual controls** (P&L lifetime card): **rebuild** forces an
  immediate full backfill (payout re-fetch + Braiins spend-cache
  refresh); **hard reset** is the nuclear option - it wipes
  `ocean_payouts` and the Braiins spend cache and rebuilds both from
  scratch. Hard reset is fetch-before-delete (an Ocean outage aborts it
  and leaves the store intact), and `ocean_payouts` is a leaf table with
  no FKs so nothing else references the wiped rows. Both controls report
  their result inline ("N payouts, collected X").
- Transient failure (Ocean down, 429, malformed): **never** destructive.
  Keep the existing store, log, retry next cycle. `collected` degrades
  to last-known, exactly as the on-chain path does today.

### P&L wiring (`finance.ts`)

- `collected_sat = oceanPayoutsRepo.sumNetUpTo(Date.now())` (sum of
  `net_sat`). Replaces `rewardEventsRepo.sumPaidUpTo`.
- Add `collected_onchain_sat` / `collected_lightning_sat` to the finance
  payload for the UI split.
- `collected_status`: `computing` until the first backfill completes,
  then `ready`; `idle` if the feature somehow can't run.
- `net`, `expected_sat` (from `statsnap.unpaid_sat`),
  `historical_offset_sat`, `spent_sat` unchanged. Net formula unchanged:
  `collected + offset + expected − spent`.
- Timing skew (earnpay reports a payout before `statsnap` reflects the
  unpaid drop, or vice-versa) self-heals within a refresh cycle; note it
  but no special handling.

### Alerts (`alert-copy.ts`, en/nl/es)

- Stage 1 (unchanged trigger): `payout_initiated` on `statsnap` unpaid
  drop - already reworded (094f7d5) to not promise an on-chain-specific
  follow-up.
- Stage 2 (new): when the refresher upserts a payout whose
  `enriched_alert = 0` and that plausibly matches a recent
  `payout_initiated` (nearest by `ts` + amount within a tolerance
  window), fire an enriched alert carrying rail + net amount +
  txid-or-"Lightning", then set `enriched_alert = 1`. A payout that
  appears in earnpay with no matching initiated event (e.g. missed while
  the daemon was down) still fires the enriched alert once.

### Chart (`PriceChart.tsx`)

- Gem source switches from `rewardEvents` to `ocean_payouts` (new view
  over the finance/metrics payload). on-chain rows keep
  `txExplorerTemplate` link; Lightning rows render the gem with a
  tooltip line "Lightning payout (off-chain)" and no link.
- Keep `reward_events` available for a debug overlay if useful, but it is
  no longer the payout-marker source.

### i18n / docs / build

- Every new string in en + nl + es `.po`, recompiled, per the
  translate-all-locales rule.
- Update `docs/spec.md`, `docs/architecture.md`, README payout section,
  and the ocean-pool skill (payout structure) in the same change set.
- Bump `BUILD_NUMBER`; CHANGELOG `[Feature]` entry referencing #323.
- New migration -> `db.test.ts` expected-list update, same commit.

## Acceptance criteria

1. A Lightning payout (null `on_chain_txid`) raises `collected_sat` by
   its `net_sat`, so `net` no longer understates.
2. On a fresh install pointed at the operator's address, backfill
   reproduces all 9 historical on-chain payouts and `collected` matches
   the sum of their net amounts.
3. The P&L card shows an on-chain vs Lightning split; the totals add up
   to `collected`.
4. Every payout appears as a chart gem; on-chain gems link to the
   explorer, Lightning gems do not and are labelled off-chain.
5. A payout produces two Telegram messages: the instant approximate
   heads-up and a later enriched confirmation with rail + amount.
6. Ocean/earnpay unavailability never zeroes or corrupts stored
   payouts; `collected` holds last-known.
7. Existing `historical_payouts_offset_sat` is unchanged after upgrade;
   a one-time notice explains the offset may now double-count.
8. en/nl/es catalogs carry every new string (no raw Lingui hash IDs).

## BIP110-chain exception (#366, 2026-08-20)

Everything above assumes the earnpay endpoint exists for the operator's address. On `ocean_chain = bip110` it does not - Ocean provides no API for that chain (see `research.md` §5.3) - and the chain-gated Ocean client short-circuits `fetchPayouts` to null, which this design correctly treats as "ledger unreadable, keep last-known" forever. So on the BIP110 chain the earnpay pipeline is dormant by construction and P&L `collected` reverts to the pre-#323 on-chain derivation: the sum of non-reorged `reward_events` (the payout observer's address-history ledger via the operator's own node), labeled "collected (on-chain)". Lightning payouts are untrackable there (no ledger to read, no unpaid feed for the deduction scanner, which never runs since it only fires after a successful earnpay sync) and are reported as unknown, never 0. The P&L *rebuild* and *hard reset* routes detect the chain and re-run the on-chain address-history backfill instead of the earnpay fetch, keeping the fetch-before-delete safety property (probe scan first, wipe only on success). Switching back to `mainstream` reactivates everything in this document unchanged.
