import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type DatabaseHandle } from '../state/db.js';
import { OceanPayoutsRepo } from '../state/repos/ocean_payouts.js';
import { TickMetricsRepo } from '../state/repos/tick_metrics.js';
import {
  DeducedPayoutsScanner,
  TYPE_RESOLUTION_MS,
  collapseCooldown,
} from './deduced-payouts.js';

const ADDR = 'bc1qux2aehp5ny89l9spguf052x84zm8h9uyfqvgdg';
const MIN = 60_000;
const DAY = 24 * 60 * 60 * 1000;

describe('DeducedPayoutsScanner (#343)', () => {
  let handle: DatabaseHandle;
  let payoutsRepo: OceanPayoutsRepo;
  let ticksRepo: TickMetricsRepo;

  beforeEach(async () => {
    handle = await openDatabase({ path: ':memory:' });
    payoutsRepo = new OceanPayoutsRepo(handle.db);
    ticksRepo = new TickMetricsRepo(handle.db);
  });

  afterEach(async () => {
    await closeDatabase(handle);
  });

  async function tick(tick_at: number, ocean_unpaid_sat: number | null): Promise<void> {
    await ticksRepo.insert({
      tick_at,
      delivered_ph: 1,
      target_ph: 1,
      floor_ph: 0,
      owned_bid_count: 1,
      unknown_bid_count: 0,
      our_primary_price_sat_per_eh_day: null,
      best_bid_sat_per_eh_day: null,
      best_ask_sat_per_eh_day: null,
      fillable_ask_sat_per_eh_day: null,
      hashprice_sat_per_eh_day: null,
      max_bid_sat_per_eh_day: null,
      max_overpay_vs_hashprice_sat_per_eh_day: null,
      available_balance_sat: null,
      total_balance_sat: null,
      datum_hashrate_ph: null,
      ocean_hashrate_ph: null,
      share_log_pct: null,
      spend_sat: null,
      primary_bid_consumed_sat: null,
      network_difficulty: null,
      estimated_block_reward_sat: null,
      pool_hashrate_ph: null,
      pool_active_workers: null,
      braiins_total_deposited_sat: null,
      braiins_total_spent_sat: null,
      ocean_unpaid_sat,
      paid_total_sat: null,
      btc_usd_price: null,
      btc_usd_price_source: null,
      primary_bid_last_pause_reason: null,
      primary_bid_fee_paid_sat: null,
      primary_bid_fee_rate_pct: null,
      bid_edit_deadband_pct: 0,
      pool_blocks_24h_count: null,
      pool_blocks_7d_count: null,
      pool_hashrate_ph_avg_24h: null,
      pool_hashrate_ph_avg_7d: null,
      pool_luck_24h: null,
      pool_luck_7d: null,
      pool_luck_30d: null,
      pool_blocks_30d_count: null,
      pool_hashrate_ph_avg_30d: null,
      braiins_reachable: null,
      primary_bid_shares_purchased_m: null,
      primary_bid_shares_accepted_m: null,
      primary_bid_shares_rejected_m: null,
      run_mode: 'LIVE',
      action_mode: 'NORMAL',
    });
  }

  function scanner(nowMs: number): DeducedPayoutsScanner {
    return new DeducedPayoutsScanner({
      tickMetricsRepo: ticksRepo,
      oceanPayoutsRepo: payoutsRepo,
      getAddress: () => ADDR,
      now: () => nowMs,
    });
  }

  /** Steady accrual, then a payout drop at `dropAt` confirmed by two low ticks. */
  async function seedDrop(dropAt: number, preDropSat: number): Promise<void> {
    await tick(dropAt - 2 * MIN, preDropSat - 200);
    await tick(dropAt - MIN, preDropSat);
    await tick(dropAt, 0);
    await tick(dropAt + MIN, 100);
    await tick(dropAt + 2 * MIN, 250);
  }

  it('deduces a Lightning payout from a confirmed historical drop with no earnpay match', async () => {
    const dropAt = 10 * DAY;
    await seedDrop(dropAt, 200_000);

    await scanner(12 * DAY).scan(true);

    const rows = await payoutsRepo.listForAddressSince(ADDR, 0);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.deduced).toBe(1);
    // Past the 24h correction window -> resolved 'lightning' directly.
    expect(row.rail).toBe('lightning');
    expect(row.net_sat).toBe(200_000);
    expect(row.ts).toBe(dropAt);
    expect(row.on_chain_txid).toBeNull();
    // Never re-alerts: the payout_initiated alert covered the drop.
    expect(row.enriched_alert).toBe(1);
    // P&L picks it up without any finance.ts changes.
    expect(await payoutsRepo.sumNetUpTo(ADDR, 13 * DAY)).toBe(200_000);
    expect(await payoutsRepo.sumNetByRail(ADDR, 13 * DAY)).toEqual({
      onchain: 0,
      lightning: 200_000,
    });
  });

  it('starts a fresh drop as rail unknown, then resolves it to lightning after 24h', async () => {
    const dropAt = 10 * DAY;
    await seedDrop(dropAt, 200_000);

    // Scan shortly after the confirming tick: inside the window.
    await scanner(dropAt + 10 * MIN).scan(false);
    let rows = await payoutsRepo.listForAddressSince(ADDR, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rail).toBe('unknown');
    // 'unknown' counts toward the Lightning bucket in the P&L split.
    expect((await payoutsRepo.sumNetByRail(ADDR, 11 * DAY)).lightning).toBe(200_000);

    // Next pass past the correction window: resolves by elimination.
    await scanner(dropAt + TYPE_RESOLUTION_MS + 10 * MIN).scan(false);
    rows = await payoutsRepo.listForAddressSince(ADDR, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rail).toBe('lightning');
  });

  it('ignores a single-tick glitch where unpaid bounces back', async () => {
    const at = 10 * DAY;
    await tick(at - MIN, 200_000);
    await tick(at, 0); // Ocean briefly reports 0...
    await tick(at + MIN, 200_400); // ...and recovers next tick
    await tick(at + 2 * MIN, 200_600);

    await scanner(12 * DAY).scan(true);
    expect(await payoutsRepo.listForAddressSince(ADDR, 0)).toHaveLength(0);
  });

  it('does not deduce a drop that matches an earnpay settlement (time + amount margins)', async () => {
    const dropAt = 10 * DAY;
    await seedDrop(dropAt, 200_000);
    // Real on-chain record: 3h later than our drop tick, net slightly
    // under the pre-drop reading (fees) - inside both margins.
    await payoutsRepo.upsertMany(
      [{ address: ADDR, ts_ms: dropAt + 3 * 60 * MIN, on_chain_txid: 'tx1', net_sat: 195_000, is_generation: false }],
      dropAt,
      1,
    );

    await scanner(12 * DAY).scan(true);
    const rows = await payoutsRepo.listForAddressSince(ADDR, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deduced).toBe(0);
  });

  it('supersedes an existing deduced row when the real settlement shows up later', async () => {
    const dropAt = 10 * DAY;
    await seedDrop(dropAt, 200_000);

    await scanner(dropAt + 10 * MIN).scan(false);
    expect(await payoutsRepo.listForAddressSince(ADDR, 0)).toHaveLength(1);

    // The earnpay record lands on a later sync (laggy on-chain record,
    // or a future Ocean API that reports Lightning).
    await payoutsRepo.upsertMany(
      [{ address: ADDR, ts_ms: dropAt + 60 * MIN, on_chain_txid: 'tx1', net_sat: 198_000, is_generation: false }],
      dropAt + 60 * MIN,
      1,
    );
    await scanner(dropAt + 90 * MIN).scan(false);

    const rows = await payoutsRepo.listForAddressSince(ADDR, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deduced).toBe(0);
    expect(rows[0]!.on_chain_txid).toBe('tx1');

    // And it stays superseded on the next full pass - the candidate
    // now matches the real record, so it is never re-deduced.
    await scanner(dropAt + 2 * DAY).scan(true);
    expect(await payoutsRepo.listForAddressSince(ADDR, 0)).toHaveLength(1);
  });

  it('collapses a two-step drop into one deduced payout carrying the full pre-drop amount', async () => {
    const dropAt = 10 * DAY;
    await tick(dropAt - MIN, 500_000);
    await tick(dropAt, 250_000); // Ocean surfaces the payout in two steps
    await tick(dropAt + MIN, 0);
    await tick(dropAt + 2 * MIN, 150);

    await scanner(12 * DAY).scan(true);
    const rows = await payoutsRepo.listForAddressSince(ADDR, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.net_sat).toBe(500_000);
    expect(rows[0]!.ts).toBe(dropAt);
  });

  it('is idempotent across repeated scans and survives a hard-reset-style delete', async () => {
    const dropAt = 10 * DAY;
    await seedDrop(dropAt, 200_000);

    await scanner(12 * DAY).scan(true);
    await scanner(12 * DAY).scan(true);
    expect(await payoutsRepo.listForAddressSince(ADDR, 0)).toHaveLength(1);

    // Hard reset wipes the store; the next full pass re-derives the
    // deduced row from the immutable tick history.
    await payoutsRepo.deleteForAddress(ADDR);
    await scanner(12 * DAY).scan(true);
    expect(await payoutsRepo.listForAddressSince(ADDR, 0)).toHaveLength(1);
  });

  it('ignores drops below the noise floor', async () => {
    const dropAt = 10 * DAY;
    await seedDrop(dropAt, 5_000); // under MIN_PRE_DROP_SAT
    await scanner(12 * DAY).scan(true);
    expect(await payoutsRepo.listForAddressSince(ADDR, 0)).toHaveLength(0);
  });

  it('bridges NULL readings (Ocean outage) when detecting a drop', async () => {
    const dropAt = 10 * DAY;
    await tick(dropAt - 3 * MIN, 200_000);
    await tick(dropAt - 2 * MIN, null);
    await tick(dropAt - MIN, null);
    await tick(dropAt, 0);
    await tick(dropAt + MIN, 50);

    await scanner(12 * DAY).scan(true);
    const rows = await payoutsRepo.listForAddressSince(ADDR, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.net_sat).toBe(200_000);
  });
});

describe('collapseCooldown', () => {
  it('keeps the first candidate and drops trailing ones inside the cooldown', () => {
    const collapsed = collapseCooldown(
      [
        { tick_at: 0, pre_drop_unpaid_sat: 500 },
        { tick_at: 60_000, pre_drop_unpaid_sat: 250 },
        { tick_at: 45 * 60_000, pre_drop_unpaid_sat: 400 },
      ],
      30 * 60_000,
    );
    expect(collapsed.map((c) => c.tick_at)).toEqual([0, 45 * 60_000]);
  });
});
