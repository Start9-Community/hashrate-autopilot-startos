/**
 * #323: keeps the `ocean_payouts` store in sync with Ocean's
 * authoritative `/v1/earnpay` payout list, which becomes the source of
 * truth for lifetime "collected" in the P&L panel (Lightning included).
 *
 * Two write paths, both idempotent (upsert on `dedup_key`):
 *
 *   1. Full backfill - "always fetch from the beginning". Runs at boot
 *      when the current payout address has no stored rows (fresh
 *      install, or the operator just switched addresses). Pulls the
 *      entire history with a wide date range.
 *
 *   2. Incremental refresh - a trailing window (last 60 days) on a slow
 *      cadence. Catches new payouts and is cheap (one API call), so it
 *      doubles as the steady-state "did a payout just settle" poll that
 *      the two-stage alert enrichment hangs off.
 *
 * The daemon owns this refresh cadence (never a dashboard HTTP poll -
 * see the "daemon drives every metric refresh" convention). Transient
 * Ocean failures are non-destructive: the store keeps its last-known
 * rows and `collected` degrades to last-known, exactly like the
 * on-chain path.
 */

import type { OceanPayoutsRepo, OceanPayoutInsert } from '../state/repos/ocean_payouts.js';
import type { OceanClient } from './ocean.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Trailing window for the incremental refresh. Comfortably longer than
// any realistic payout interval, so a new settlement is always inside
// it; short enough that the earnpay payload stays small.
const REFRESH_WINDOW_DAYS = 60;
// Wide lower bound for the full backfill. Predates Ocean itself, so it
// always captures the operator's entire settlement history.
const BACKFILL_START_DATE = '2020-01-01';
// #343: re-run the full backfill (not just the 60-day refresh) at least
// this often, so a store that ended up incomplete self-heals. The
// original design only full-backfilled once (when the store was empty),
// so a single partial earnpay read during that one shot left `collected`
// permanently short with no way to recover. A full earnpay fetch returns
// the entire history (verified, no server-side cap), and upsert is a
// no-op for rows we already have, so periodically re-fetching everything
// closes any gap. Also runs on the first sync of every boot
// (`lastFullBackfillMs` starts at 0), so a restart heals too.
const FULL_BACKFILL_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Slow steady-state cadence. Payouts are days apart; a 5-min poll is
// polite to Ocean's public API and still surfaces a fresh settlement
// well within one dashboard refresh.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
// First refresh shortly after boot, after the heavier boot backfills
// have had a moment to settle.
const INITIAL_DELAY_MS = 8 * 1000;

/** #343: result of a rebuild/hard-reset, for the operator-facing confirmation. */
export interface PayoutSyncSummary {
  /** Stored payout rows for the address after the sync. */
  readonly payouts: number;
  /** Lifetime collected (sum of net_sat) after the sync, in sat. */
  readonly collected_sat: number;
}

export interface OceanPayoutsServiceOptions {
  readonly oceanClient: OceanClient;
  readonly repo: OceanPayoutsRepo;
  readonly getAddress: () => string;
  readonly now?: () => number;
  readonly log?: (msg: string) => void;
  /**
   * Fired after a refresh/backfill inserts at least one NEW payout row.
   * Used to kick P&L / chart recompute and (later) the stage-2 alert
   * enrichment without waiting for the next tick. Best-effort.
   */
  readonly onPayoutsChanged?: () => Promise<void>;
}

/** ms-epoch -> `YYYY-MM-DD` in UTC (matches how Ocean interprets the range). */
function toDateParam(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export class OceanPayoutsService {
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  // Which address the store has been synced against at least once this
  // run, so the P&L panel can show a spinner ('computing') for an
  // address whose payouts we haven't fetched yet vs an em-dash for no
  // address at all. Null until the first successful sync completes.
  private syncedAddress: string | null = null;
  // #343: when the last full (whole-history) backfill ran. Starts at 0 so
  // the first sync of every boot re-fetches everything; refreshed on each
  // successful full backfill to gate the periodic re-heal.
  private lastFullBackfillMs = 0;
  // #343: set by requestFullBackfill() (the P&L "rebuild" button) to force
  // the next sync to re-fetch the whole history regardless of the timer.
  private forceFullBackfill = false;
  // #343: set by hardReset() (the P&L "hard reset" button). Like a full
  // backfill, but wipes the stored rows first (after a successful fetch)
  // so the store becomes an exact copy of Ocean's ledger with no stale
  // rows. Fetch-before-delete: an Ocean failure leaves the data intact.
  private forceHardReset = false;

  constructor(private readonly options: OceanPayoutsServiceOptions) {}

  private get now(): () => number {
    return this.options.now ?? (() => Date.now());
  }

  private log(msg: string): void {
    this.options.log?.(msg);
  }

  /**
   * One sync pass. Full backfill when the current address has no stored
   * payouts (fresh install / address change), otherwise an incremental
   * trailing-window refresh. Never throws.
   */
  async syncOnce(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.doSync().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async doSync(): Promise<void> {
    const address = this.options.getAddress();
    if (!address) return;

    const nowMs = this.now();
    let stored = 0;
    try {
      stored = await this.options.repo.countForAddress(address);
    } catch (err) {
      this.log(`[ocean-payouts] count failed: ${(err as Error).message}`);
      return;
    }

    const endDate = toDateParam(nowMs + DAY_MS);
    // Full backfill when: the store is empty (fresh install / address
    // change), the operator forced it (rebuild button), OR it's been long
    // enough since the last one (#343 self-heal). Otherwise the cheap
    // trailing-window refresh.
    const dueForPeriodicFull = nowMs - this.lastFullBackfillMs >= FULL_BACKFILL_INTERVAL_MS;
    const fullBackfill =
      stored === 0 || this.forceFullBackfill || this.forceHardReset || dueForPeriodicFull;
    const startDate = fullBackfill
      ? BACKFILL_START_DATE
      : toDateParam(nowMs - REFRESH_WINDOW_DAYS * DAY_MS);

    const payouts = await this.options.oceanClient.fetchPayouts(
      address,
      startDate,
      endDate,
    );
    if (payouts === null) {
      // Non-destructive: Ocean unreachable / parse error. Keep
      // whatever we have; retry next cycle. Don't mark this address
      // as synced - we still owe it an authoritative read.
      this.log('[ocean-payouts] fetch returned null; keeping last-known store');
      return;
    }

    // Authoritative read succeeded (even if it returned zero payouts):
    // the P&L panel can now treat a 0 collected as "genuinely no
    // payouts yet" instead of "still loading".
    this.syncedAddress = address;
    // A full fetch just completed successfully: reset the heal timer and
    // consume any forced-rebuild request (#343). Only on success, so a
    // failed fetch retries the full backfill next cycle.
    if (fullBackfill) {
      this.lastFullBackfillMs = nowMs;
      this.forceFullBackfill = false;
    }
    // #343 hard reset: the fetch above succeeded, so it's now safe to wipe
    // the old rows before re-inserting the fresh full history. A delete
    // failure is non-fatal - the upsert below still fills the store.
    if (this.forceHardReset) {
      try {
        await this.options.repo.deleteForAddress(address);
      } catch (err) {
        this.log(`[ocean-payouts] hard-reset delete failed: ${(err as Error).message}`);
      }
      this.forceHardReset = false;
    }

    const rows: OceanPayoutInsert[] = payouts.map((p) => ({
      address,
      ts_ms: p.ts_ms,
      on_chain_txid: p.on_chain_txid,
      net_sat: p.net_sat,
      is_generation: p.is_generation,
    }));

    let inserted = 0;
    try {
      // Full backfill = historical payouts -> baseline as already
      // enriched (silent). Incremental refresh -> enriched_alert 0 so a
      // new settlement fires the stage-2 "payout confirmed" alert.
      inserted = await this.options.repo.upsertMany(rows, nowMs, fullBackfill ? 1 : 0);
    } catch (err) {
      this.log(`[ocean-payouts] upsert failed: ${(err as Error).message}`);
      return;
    }

    this.log(
      `[ocean-payouts] ${fullBackfill ? 'backfill' : 'refresh'} ${address.slice(0, 12)}…: ` +
        `${payouts.length} payout(s) in window, ${inserted} new`,
    );

    if (inserted > 0 && this.options.onPayoutsChanged) {
      await this.options.onPayoutsChanged().catch((err) =>
        this.log(`[ocean-payouts] onPayoutsChanged failed: ${(err as Error).message}`),
      );
    }
  }

  /**
   * P&L "collected" status for the given address:
   * - 'idle'      - no payout address configured; nothing to fetch.
   * - 'computing' - address set but we haven't completed an
   *   authoritative earnpay read for it yet this run (fresh boot /
   *   just-switched address). The panel shows a spinner rather than a
   *   possibly-stale 0.
   * - 'ready'     - we've read earnpay for this address at least once;
   *   the stored total (which may legitimately be 0) is trustworthy.
   *
   * The route additionally short-circuits to 'ready' when the stored
   * total is already > 0, so a returning install with persisted
   * payouts never flashes a spinner while the first refresh runs.
   */
  getCollectedStatus(address: string): 'computing' | 'ready' | 'idle' {
    if (!address) return 'idle';
    return this.syncedAddress === address ? 'ready' : 'computing';
  }

  /**
   * #343: force the next sync to re-fetch the entire payout history and
   * upsert it, healing a store that ended up incomplete. Backs the P&L
   * "rebuild" button. Runs a sync immediately and resolves when it's
   * done, so the caller can report a fresh `collected`.
   */
  async requestFullBackfill(): Promise<PayoutSyncSummary> {
    this.forceFullBackfill = true;
    await this.syncOnce();
    return this.summary();
  }

  /** Post-sync tally for the P&L rebuild/reset confirmation (#343). */
  private async summary(): Promise<PayoutSyncSummary> {
    const address = this.options.getAddress();
    if (!address) return { payouts: 0, collected_sat: 0 };
    const [payouts, collected_sat] = await Promise.all([
      this.options.repo.countForAddress(address).catch(() => 0),
      this.options.repo.sumNetUpTo(address, this.now()).catch(() => 0),
    ]);
    return { payouts, collected_sat };
  }

  /**
   * #343: hard reset - wipe the stored payouts and rebuild them from a
   * fresh full earnpay fetch, so the store is an exact copy of Ocean's
   * ledger with no stale rows. The delete only happens after the fetch
   * succeeds (see doSync), so an Ocean outage leaves the data intact.
   * Backs the P&L "hard reset" button.
   */
  async hardReset(): Promise<PayoutSyncSummary> {
    this.forceHardReset = true;
    await this.syncOnce();
    return this.summary();
  }

  start(): void {
    if (this.timer || this.initialTimer) return;
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      void this.syncOnce();
    }, INITIAL_DELAY_MS);
    this.timer = setInterval(() => void this.syncOnce(), REFRESH_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    this.initialTimer = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running?.catch(() => {});
  }
}
