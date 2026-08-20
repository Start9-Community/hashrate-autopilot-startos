/**
 * GET /api/finance - top-level money panel for the dashboard.
 *
 * Combines three sources into a single profit/loss view:
 *   - spent      = scope per config.spent_scope: 'account' (default)
 *                  counts the whole account via AccountSpendService,
 *                  'autopilot' restricts to lifetime amount_consumed_sat
 *                  over ledger-owned bids. (There is no dashboard
 *                  manual-bump path - §7.3's override flow was retired
 *                  unbuilt.)
 *   - collected  = lifetime sat received at the configured payout
 *                  address (sum of reward_events.value_sat where
 *                  reorged=0). We count "what they put in," not the
 *                  current balance - so a payout that's been spent
 *                  still counts. Until #240 follow-up (this commit)
 *                  this was `total_unspent_sat` from the observer's
 *                  in-memory UTXO snapshot; operator caught that
 *                  semantic when a new-address payout-then-spend
 *                  cycle made the tile read 0 despite the address
 *                  having received the payout.
 *   - expected   = Ocean's "Unpaid Earnings" - the BTC amount that
 *                  will land at the next payout (when above threshold)
 *                  or has already been earned but is below threshold.
 *
 * #366: on `ocean_chain = bip110` the earnpay/statsnap sources above
 * can never populate (Ocean provides no API for that chain), so
 * collected is instead the sum of non-reorged `reward_events` - pure
 * on-chain derivation via the operator's own node - Lightning is
 * explicitly untrackable (null), and net drops the expected term.
 *
 * net = collected + expected − spent.  Positive = autopilot is in the
 * black, negative = still digging out of the initial deposit.
 *
 * Each source can independently be `null` when its data isn't
 * available yet (Ocean down, electrs/bitcoind unconfigured, fresh
 * install with no bids). The dashboard renders "-" for nulls and
 * skips them in the net calculation (so `net` is null until both
 * collected and expected have at least one observation).
 */

import type { FastifyInstance } from 'fastify';

import {
  CHART_RANGE_SPECS,
  DEFAULT_CHART_RANGE,
  parseChartRange,
  type ChartRange,
} from '@hashrate-autopilot/shared';

import type { AccountSpendService } from '../../services/account-spend.js';
import type { HashpriceCache } from '../../services/hashprice-cache.js';
import type { OceanClient } from '../../services/ocean.js';
import type { OceanPayoutsService } from '../../services/ocean-payouts-service.js';
import type { PayoutObserver } from '../../services/payout-observer.js';
import type { OwnedBidsRepo } from '../../state/repos/owned_bids.js';
import type { ConfigRepo } from '../../state/repos/config.js';
import type { OceanPayoutsRepo } from '../../state/repos/ocean_payouts.js';
import type { RewardEventsRepo } from '../../state/repos/reward_events.js';
import type { TickMetricsRepo } from '../../state/repos/tick_metrics.js';

const EH_PER_PH = 1000;

/**
 * Minimum tick count within the selected window before the
 * dashboard trusts the avg-based P&L values. Below this, the UI
 * badges the card `insufficient history` and surfaces the
 * instantaneous fallback. Five ticks ≈ 5 minutes of real-time
 * data; fresh installs, heavily-pruned DBs, and post-restart
 * states all hit this.
 */
const MIN_TICKS_FOR_AVG = 5;

export interface FinanceResponse {
  readonly spent_sat: number;
  /** Which scope produced `spent_sat`. Mirrors the config field. */
  readonly spent_scope: 'autopilot' | 'account';
  /** #363: which Ocean sharelog the daemon follows. On 'bip110' the
   * Ocean-sourced income rows (unpaid earnings) can never populate -
   * Ocean provides no API for that chain - so P&L is incomplete and
   * the dashboard says so. On-chain collected still works via the
   * operator's own node. */
  readonly ocean_chain: 'mainstream' | 'bip110';
  /**
   * Breakdown of `spent_sat` into closed (terminal) vs active
   * (is_current) bids. Only populated under `spent_scope = 'account'`;
   * null under autopilot scope (we'd need to walk each owned bid's
   * status to split it, and it's not needed for that view). The
   * dashboard surfaces these as sub-rows under the spent line.
   */
  readonly spent_closed_sat: number | null;
  readonly spent_active_sat: number | null;
  readonly collected_sat: number | null;
  /**
   * #323: collected split by settlement rail, so the P&L panel can show
   * "0.081 on-chain, 0.012 Lightning". `collected_onchain_sat +
   * collected_lightning_sat === collected_sat`. Null in the same states
   * `collected_sat` is null (no payout address configured).
   */
  readonly collected_onchain_sat: number | null;
  readonly collected_lightning_sat: number | null;
  /**
   * #97 / #323 - disambiguates the three states `collected_sat: null`
   * collapses into for the dashboard:
   * - 'computing' - a payout address is configured but the daemon
   *   hasn't completed its first earnpay read for it yet (fresh boot /
   *   just-switched address). Dashboard renders a spinner so the
   *   operator does not see a blank em-dash mid-startup.
   * - 'ready'     - earnpay has been read at least once; `collected_sat`
   *   reflects it (0 is a legitimate "no payouts yet" value).
   * - 'idle'      - no payout address configured, so there's nothing to
   *   fetch. Dashboard renders the existing "not configured" tooltip on
   *   the em-dash.
   */
  readonly collected_status: 'computing' | 'ready' | 'idle';
  readonly expected_sat: number | null;
  /**
   * #170 follow-up: operator-entered offset for pre-installation /
   * off-chain earnings (Lightning payouts, pre-autopilot Ocean
   * history that's been swept, etc.). Always >= 0; mirrors the
   * config knob `historical_payouts_offset_sat`. Added into
   * `net_sat` server-side so the panel's net line is coherent
   * without the dashboard having to do the arithmetic. Surfaced as
   * a separate field so the dashboard can render a dedicated row.
   */
  readonly historical_offset_sat: number;
  readonly net_sat: number | null;
  readonly ocean: {
    readonly lifetime_sat: number | null;
    readonly daily_estimate_sat: number | null;
    readonly hashprice_sat_per_ph_day: number | null;
    readonly rewards_in_window_sat: number | null;
    readonly time_to_payout_text: string | null;
    readonly payout_threshold_sat: number;
    readonly fetched_at_ms: number | null;
  } | null;
  readonly checked_at_ms: number;
}

export interface FinanceDeps {
  readonly ownedBidsRepo: OwnedBidsRepo;
  readonly configRepo: ConfigRepo;
  /** Still used for `checked_at_ms` staleness (on-chain snapshot time), not for collected. */
  readonly payoutObserver: PayoutObserver | null;
  readonly oceanClient: OceanClient | null;
  readonly accountSpend: AccountSpendService | null;
  readonly hashpriceCache: HashpriceCache | null;
  readonly tickMetricsRepo: TickMetricsRepo;
  /** #323: source of truth for lifetime collected (on-chain + Lightning) via Ocean earnpay. */
  readonly oceanPayoutsRepo: OceanPayoutsRepo;
  /** #323: provides the collected computing/ready/idle status for the panel. */
  readonly oceanPayoutsService: OceanPayoutsService;
  /**
   * #366: source of truth for lifetime collected on the BIP110 chain,
   * where earnpay can never sync (Ocean provides no API for that
   * chain). Sum of non-reorged on-chain outputs at the payout address,
   * as observed by the operator's own node - the same ledger that
   * drives the chart's lifetime-earnings line.
   */
  readonly rewardEventsRepo: RewardEventsRepo;
}

/**
 * Response from `/api/finance/range?range=<ChartRange>`. Feeds the
 * range-aware P&L per-day card (issue #43). Separate from `/api/finance`
 * because the two have different update cadences: lifetime values
 * come from Ocean + on-chain (hourly refresh); range values come from
 * tick_metrics (every tick). Also, this endpoint is parameterised on
 * the chart-range dropdown, which `/api/finance` is not.
 */
export interface FinanceRangeResponse {
  readonly range: ChartRange;
  readonly window_ms: number | null;
  readonly tick_count: number;
  readonly first_tick_at: number | null;
  readonly last_tick_at: number | null;
  readonly avg_hashprice_sat_per_ph_day: number | null;
  readonly avg_delivered_ph: number | null;
  /**
   * Actual sat consumed across the range, summed from per-tick
   * `primary_bid_consumed_sat` deltas. Authoritative spend - what
   * Braiins actually charged. Null when no usable deltas in range.
   */
  readonly actual_spend_sat: number | null;
  /**
   * `actual_spend_sat` scaled to a 24h rate using the covered span
   * (last_tick_at − first_tick_at). Null when span is too short to
   * trust (< MIN_TICKS_FOR_AVG ticks) or no usable spend.
   */
  readonly actual_spend_per_day_sat: number | null;
  /**
   * Derived: `avg_hashprice × avg_delivered`, in sat/day. The income
   * side is still a projection (Ocean's 3h hashrate × market
   * break-even), not a measurement - kept symmetric with the
   * previous version. Null equivalently.
   */
  readonly projected_income_per_day_sat: number | null;
  /**
   * `projected_income_per_day_sat − actual_spend_per_day_sat`. The
   * "net" the operator actually sees; positive = profitable.
   */
  readonly net_per_day_sat: number | null;
  /**
   * True when tick_count < MIN_TICKS_FOR_AVG. Dashboard badges the
   * card so the operator knows to discount these numbers; derived
   * fields above are null in that case.
   */
  readonly insufficient_history: boolean;
  /**
   * #243: Braiins primary-bid share rejection rate across the
   * range, computed server-side from raw `tick_metrics` rows (NOT
   * the bucketed chart data). Bypasses the bucket-MAX information
   * loss that made the chart-derived rate inconsistent across
   * range presets. Formula: `(last_rejected - first_rejected) /
   * (last_purchased - first_purchased) * 100` against the
   * cumulative-since-bid-creation counters. Null when no usable
   * counter samples in range, no shares cleared, or a single bid
   * rotation made the deltas non-sensical.
   */
  readonly braiins_rejection_pct: number | null;
}

export async function registerFinanceRoute(
  app: FastifyInstance,
  deps: FinanceDeps,
): Promise<void> {
  app.get<{ Querystring: { range?: string; since?: string; until?: string } }>(
    '/api/finance/range',
    async (req): Promise<FinanceRangeResponse> => {
      // #169: arbitrary viewport path
      const parsedSince = Number.parseInt(req.query.since ?? '', 10);
      const parsedUntil = Number.parseInt(req.query.until ?? '', 10);
      let range: ChartRange;
      let sinceMs: number | null;
      let untilMs: number | undefined;
      let windowMs: number | null;
      if (
        !req.query.range &&
        Number.isFinite(parsedSince) && parsedSince > 0 &&
        Number.isFinite(parsedUntil) && parsedUntil > parsedSince
      ) {
        range = '24h';
        sinceMs = parsedSince;
        untilMs = parsedUntil;
        windowMs = parsedUntil - parsedSince;
      } else {
        range = parseChartRange(req.query.range) ?? DEFAULT_CHART_RANGE;
        const spec = CHART_RANGE_SPECS[range];
        windowMs = spec.windowMs;
        sinceMs = spec.windowMs === null ? null : Date.now() - spec.windowMs;
      }

      const [agg, braiinsRejectionPct] = await Promise.all([
        deps.tickMetricsRepo.rangeFinanceAggregates(sinceMs, untilMs),
        deps.tickMetricsRepo.braiinsRejectionPctSince(sinceMs, untilMs),
      ]);
      const insufficient = agg.tick_count < MIN_TICKS_FOR_AVG;

      const avgHashpricePh =
        agg.avg_hashprice_sat_per_eh_day !== null
          ? agg.avg_hashprice_sat_per_eh_day / EH_PER_PH
          : null;

      // Actual spend/day = (sat spent in covered window) × 86.4M / (span ms).
      // Span comes from the actual first/last tick in range, not the
      // requested window, so a partially-populated range still reads
      // a correct daily rate.
      const spanMs =
        agg.first_tick_at !== null && agg.last_tick_at !== null
          ? agg.last_tick_at - agg.first_tick_at
          : 0;
      const actualSpendPerDay =
        !insufficient && agg.actual_spend_sat !== null && spanMs > 0
          ? (agg.actual_spend_sat * 86_400_000) / spanMs
          : null;
      const incomePerDay =
        !insufficient && avgHashpricePh !== null && agg.avg_delivered_ph !== null
          ? avgHashpricePh * agg.avg_delivered_ph
          : null;
      const netPerDay =
        actualSpendPerDay !== null && incomePerDay !== null
          ? incomePerDay - actualSpendPerDay
          : null;

      return {
        range,
        window_ms: windowMs,
        tick_count: agg.tick_count,
        first_tick_at: agg.first_tick_at,
        last_tick_at: agg.last_tick_at,
        avg_hashprice_sat_per_ph_day: avgHashpricePh,
        avg_delivered_ph: agg.avg_delivered_ph,
        actual_spend_sat: agg.actual_spend_sat,
        actual_spend_per_day_sat: actualSpendPerDay,
        projected_income_per_day_sat: incomePerDay,
        net_per_day_sat: netPerDay,
        insufficient_history: insufficient,
        braiins_rejection_pct: braiinsRejectionPct,
      };
    },
  );

  app.post('/api/finance/spend/rebuild', async () => {
    // Force the closed-bids cache to repaginate from scratch on the
    // next /api/finance hit. Operator-triggered safety net when the
    // cached sum is ever suspected stale.
    if (!deps.accountSpend) {
      return { ok: false, error: 'account-spend service not configured' };
    }
    await deps.accountSpend.rebuild();
    return { ok: true };
  });

  // #366: BIP110-chain counterpart of the earnpay-backed rebuild. Ocean
  // has no API for that chain, so the payout ledger is the on-chain
  // reward_events table instead - re-derive it with a fresh walk of the
  // payout address's history via the operator's own node.
  const rebuildOnchain = async (): Promise<
    { ok: true; payouts: number; collected_sat: number } | { ok: false; error: string }
  > => {
    if (!deps.payoutObserver) {
      return {
        ok: false,
        error:
          'no on-chain scanner configured - pick a balance-check backend (Electrum recommended) under Config → Pool & Payout',
      };
    }
    const result = await deps.payoutObserver.runHistoricalBackfill();
    if (result.error) return { ok: false, error: result.error };
    const [payouts, collected_sat] = await Promise.all([
      deps.rewardEventsRepo.countNonReorged(),
      deps.rewardEventsRepo.sumPaidUpTo(Date.now()),
    ]);
    return { ok: true, payouts, collected_sat };
  };

  app.post('/api/finance/payouts/rebuild', async () => {
    const config = await deps.configRepo.get();
    if (config?.ocean_chain === 'bip110') {
      return rebuildOnchain();
    }
    // #343: force a full re-fetch of Ocean's earnpay payout history and
    // upsert it, healing a `collected` figure that ended up short because
    // the one-shot backfill captured a partial list. Safe + idempotent.
    if (!deps.oceanPayoutsService) {
      return { ok: false, error: 'ocean payouts service not configured' };
    }
    const summary = await deps.oceanPayoutsService.requestFullBackfill();
    return { ok: true, ...summary };
  });

  app.post('/api/finance/hard-reset', async () => {
    const config = await deps.configRepo.get();
    if (config?.ocean_chain === 'bip110') {
      // #366: wipe + rebuild the on-chain ledger from scratch, so stale
      // rows (previous address, previous chain) can't survive. Probe
      // the address-history walk FIRST - fetch-before-delete, same
      // safety property as the earnpay hard reset: an unreachable
      // Electrum leaves the data intact.
      const probe = deps.payoutObserver
        ? await deps.payoutObserver.runHistoricalBackfill()
        : { error: 'no on-chain scanner configured' };
      if (probe.error) {
        return { ok: false, error: probe.error };
      }
      await deps.rewardEventsRepo.deleteAll();
      const [summary] = await Promise.all([
        rebuildOnchain(),
        deps.accountSpend?.rebuild() ?? Promise.resolve(),
      ]);
      return summary;
    }
    // #343: hard reset of the whole P&L dataset - wipe + rebuild the Ocean
    // payout store from scratch (exact copy of the earnpay ledger, no
    // stale rows) AND re-paginate the Braiins spend cache. The payout wipe
    // is fetch-before-delete, so an Ocean outage leaves the store intact.
    const [summary] = await Promise.all([
      deps.oceanPayoutsService?.hardReset() ?? Promise.resolve({ payouts: 0, collected_sat: 0 }),
      deps.accountSpend?.rebuild() ?? Promise.resolve(),
    ]);
    return { ok: true, ...summary };
  });

  app.get('/api/finance', async (): Promise<FinanceResponse> => {
    const config = await deps.configRepo.get();
    const scope = config?.spent_scope ?? 'autopilot';

    let spent_sat: number;
    let spent_closed_sat: number | null = null;
    let spent_active_sat: number | null = null;
    let spendSnap: Awaited<ReturnType<NonNullable<typeof deps.accountSpend>['getLifetimeSpend']>> | null = null;
    if (scope === 'account' && deps.accountSpend) {
      const snap = await deps.accountSpend.getLifetimeSpend();
      spendSnap = snap;
      if (snap) {
        spent_sat = snap.total_settlement_sat;
        spent_closed_sat = snap.closed_sat;
        spent_active_sat = snap.active_sat;
      } else {
        // Fall back to autopilot-scope if the bid list fetch is
        // unavailable rather than falsely reporting 0 spent.
        spent_sat = await deps.ownedBidsRepo.sumLifetimeConsumedSat();
      }
    } else {
      spent_sat = await deps.ownedBidsRepo.sumLifetimeConsumedSat();
    }

    // #323: collected = LIFETIME RECEIVED via Ocean's authoritative
    // earnpay payout list, which sees BOTH on-chain and Lightning
    // settlements. This replaces the on-chain-only reward_events
    // derivation (which understated net P&L for any Lightning payout,
    // since unpaid_sat dropped but collected never rose). It's also no
    // longer gated on the on-chain scanner: earnpay needs only the
    // Ocean address, so operators without electrs/bitcoind now get a
    // collected figure too. We count "what they put in" - a payout
    // that's since been spent still counts.
    const payoutAddr = config?.btc_payout_address || null;
    const bip110 = config?.ocean_chain === 'bip110';
    let collected_sat: number | null = null;
    let collected_onchain_sat: number | null = null;
    let collected_lightning_sat: number | null = null;
    let collected_status: 'computing' | 'ready' | 'idle';
    if (!payoutAddr) {
      collected_status = 'idle';
    } else if (bip110) {
      // #366: earnpay can never sync on the BIP110 chain (Ocean
      // provides no API for it), so collected is derived purely from
      // on-chain payouts at the payout address, as observed by the
      // operator's own node (reward_events - the ledger the chart's
      // lifetime-earnings line already reads). Lightning payouts are
      // untrackable there: no ledger to read them from and no
      // unpaid-earnings feed to deduce them from, hence null (not 0 -
      // "unknown", not "none").
      if (!deps.payoutObserver) {
        // No scanner backend wired (payout_source = none): earnings are
        // structurally unobservable on this chain. Report idle so the
        // panel says "not configured" instead of a misleading 0.
        collected_status = 'idle';
      } else {
        collected_sat = await deps.rewardEventsRepo.sumPaidUpTo(Date.now());
        collected_onchain_sat = collected_sat;
        collected_status =
          collected_sat > 0 ? 'ready' : deps.payoutObserver.getCollectedStatus();
      }
    } else {
      const nowMs = Date.now();
      collected_sat = await deps.oceanPayoutsRepo.sumNetUpTo(payoutAddr, nowMs);
      const split = await deps.oceanPayoutsRepo.sumNetByRail(payoutAddr, nowMs);
      collected_onchain_sat = split.onchain;
      collected_lightning_sat = split.lightning;
      // Already have persisted payouts -> trust them immediately even
      // while a background refresh runs; otherwise defer to the
      // service's synced-once state so a fresh boot shows a spinner,
      // not a premature 0.
      collected_status =
        collected_sat > 0
          ? 'ready'
          : deps.oceanPayoutsService.getCollectedStatus(payoutAddr);
    }

    let oceanStats: Awaited<ReturnType<OceanClient['fetchStats']>> | null = null;
    if (deps.oceanClient && config?.btc_payout_address) {
      oceanStats = await deps.oceanClient.fetchStats(config.btc_payout_address);
    }

    // Feed the hashprice cache so the controller can use it for
    // cheap-hashrate scaling decisions (issue #13).
    if (oceanStats?.hashprice_sat_per_ph_day != null && deps.hashpriceCache) {
      deps.hashpriceCache.set(oceanStats.hashprice_sat_per_ph_day);
    }

    const expected_sat = oceanStats?.unpaid_sat ?? null;

    // #170 follow-up: pre-installation / off-chain earnings the
    // operator entered manually. Folded into net so the user whose
    // Ocean history pre-dates the autopilot doesn't see a permanent
    // "massive loss" on the P&L line.
    const historical_offset_sat = config?.historical_payouts_offset_sat ?? 0;

    // Net = (collected + historical_offset + expected) − spent.
    // `collected_sat` null means on-chain tracking isn't configured
    // (payout_source=none) or the observer hasn't fetched yet; treat
    // it as 0 for the arithmetic so the net line still makes sense -
    // the "collected: -" row on the panel already tells the operator
    // that piece is missing. Only surface net=null when the *income*
    // side is unavailable (Ocean unreachable): without unpaid earnings
    // we genuinely can't reason about whether we're in the black.
    //
    // #366: on the BIP110 chain `expected` is STRUCTURALLY null (no
    // API), so requiring it would pin net on "-" forever. There the
    // net line is collected + offset − spent - honest but understated
    // by whatever is still unpaid, which the panel banner says.
    const net_sat = bip110
      ? (collected_sat ?? 0) + historical_offset_sat - spent_sat
      : expected_sat !== null
        ? (collected_sat ?? 0) + historical_offset_sat + expected_sat - spent_sat
        : null;

    return {
      spent_sat,
      spent_scope: scope,
      ocean_chain: config?.ocean_chain ?? 'mainstream',
      spent_closed_sat,
      spent_active_sat,
      collected_sat,
      collected_onchain_sat,
      collected_lightning_sat,
      collected_status,
      expected_sat,
      historical_offset_sat,
      net_sat,
      ocean: oceanStats
        ? {
            lifetime_sat: oceanStats.lifetime_sat,
            daily_estimate_sat: oceanStats.daily_estimate_sat,
            hashprice_sat_per_ph_day: oceanStats.hashprice_sat_per_ph_day,
            rewards_in_window_sat: oceanStats.rewards_in_window_sat,
            time_to_payout_text: oceanStats.time_to_payout_text,
            payout_threshold_sat: oceanStats.payout_threshold_sat,
            fetched_at_ms: oceanStats.fetched_at_ms,
          }
        : null,
      // Use the oldest data-source timestamp, not Date.now(). The
      // operator wants to see how stale the *data* is, not when the
      // endpoint responded. Date.now() was always "0s ago" - useless.
      checked_at_ms: oldestSourceTimestamp(
        oceanStats?.fetched_at_ms ?? null,
        deps.payoutObserver?.getLastSnapshot()?.checked_at ?? null,
        // Reuse the snapshot fetched above - this was a second full
        // getLifetimeSpend() call for just its timestamp.
        spendSnap?.fetched_at_ms ?? null,
      ),
    };
  });
}

function oldestSourceTimestamp(...sources: (number | null)[]): number {
  const valid = sources.filter((s): s is number => s !== null && s > 0);
  return valid.length > 0 ? Math.min(...valid) : Date.now();
}
