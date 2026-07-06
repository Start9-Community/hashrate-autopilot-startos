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
// Slow steady-state cadence. Payouts are days apart; a 5-min poll is
// polite to Ocean's public API and still surfaces a fresh settlement
// well within one dashboard refresh.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
// First refresh shortly after boot, after the heavier boot backfills
// have had a moment to settle.
const INITIAL_DELAY_MS = 8 * 1000;

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
    const fullBackfill = stored === 0;
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
      // whatever we have; retry next cycle.
      this.log('[ocean-payouts] fetch returned null; keeping last-known store');
      return;
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
      inserted = await this.options.repo.upsertMany(rows, nowMs);
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
