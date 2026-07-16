/**
 * Repository for `ocean_payouts` (#323) - the persistent store of
 * Ocean's authoritative payout list from the `/v1/earnpay` endpoint.
 *
 * This is the source of truth for lifetime "collected" in the P&L
 * panel. Unlike the on-chain scanner (`reward_events`), it sees
 * Lightning payouts too, so `net = collected + offset + expected −
 * spent` no longer understates for operators paid over Lightning.
 *
 * Writes come from the OceanPayoutsService (backfill + incremental
 * refresh). Reads feed finance.ts (P&L) and the chart's payout gems.
 * All P&L reads are scoped to a single `address` so a payout-address
 * change reflects only the current address without a destructive
 * delete.
 */

import type { Kysely } from 'kysely';

import type { Database, OceanPayoutsTable } from '../types.js';

export interface OceanPayoutInsert {
  readonly address: string;
  readonly ts_ms: number;
  readonly on_chain_txid: string | null;
  readonly net_sat: number;
  readonly is_generation: boolean;
}

export interface OceanPayoutRow {
  id: number;
  address: string;
  ts: number;
  on_chain_txid: string | null;
  net_sat: number;
  is_generation: 0 | 1;
  rail: 'onchain' | 'lightning' | 'unknown';
  dedup_key: string;
  enriched_alert: 0 | 1;
  first_seen_at: number;
  /** #343: 1 = deduced from an unpaid-series drop, not from earnpay. */
  deduced: 0 | 1;
}

/** #343: a payout deduced from the unpaid-earnings series (see DeducedPayoutsScanner). */
export interface DeducedPayoutInsert {
  readonly address: string;
  /** tick_at of the first low tick - when the drop was observed. */
  readonly ts_ms: number;
  /** Last-seen unpaid value before the drop - the approximate payout amount. */
  readonly net_sat: number;
  /** 'unknown' inside the 24h correction window, 'lightning' when deduced retroactively past it. */
  readonly rail: 'unknown' | 'lightning';
}

/**
 * Idempotency key. On-chain payouts key on their txid (stable,
 * unique). Lightning payouts have no txid, so we synthesize a key from
 * their timestamp + amount - the pair is effectively unique per
 * address and stable across re-fetches of the same window.
 */
export function payoutDedupKey(row: OceanPayoutInsert): string {
  return row.on_chain_txid
    ? `${row.address}|oc:${row.on_chain_txid}`
    : `${row.address}|ln:${row.ts_ms}:${row.net_sat}`;
}

export class OceanPayoutsRepo {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Upsert N payouts. Idempotent on `dedup_key` - re-fetching a window
   * that overlaps already-stored payouts is a no-op for the existing
   * rows (INSERT ... ON CONFLICT DO NOTHING). Returns the number of
   * genuinely new rows inserted so the caller can decide whether to
   * fire the enrichment alert / recompute chart series.
   */
  async upsertMany(
    payouts: readonly OceanPayoutInsert[],
    nowMs: number,
    enrichedAlert: 0 | 1 = 0,
  ): Promise<number> {
    if (payouts.length === 0) return 0;
    const rows = payouts.map((p) => ({
      address: p.address,
      ts: p.ts_ms,
      on_chain_txid: p.on_chain_txid,
      net_sat: p.net_sat,
      is_generation: (p.is_generation ? 1 : 0) as 0 | 1,
      rail: (p.on_chain_txid ? 'onchain' : 'lightning') as 'onchain' | 'lightning',
      dedup_key: payoutDedupKey(p),
      // Full-history backfill passes 1 (historical -> baseline, no
      // stage-2 alert); the incremental refresh passes 0 so a genuinely
      // new settlement fires the enriched "payout confirmed" alert.
      enriched_alert: enrichedAlert,
      first_seen_at: nowMs,
    }));
    const result = await this.db
      .insertInto('ocean_payouts')
      .values(rows)
      .onConflict((oc) => oc.column('dedup_key').doNothing())
      .executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0);
  }

  /**
   * #343: insert deduced payouts. Idempotent on `dedup_key`
   * (`<address>|dd:<drop_tick_at>` - the drop tick is stable across
   * rescans because tick_metrics history is immutable), so the scanner
   * can re-derive the same drops every pass and only genuinely new
   * ones land. `enriched_alert` starts at 1: the payout_initiated
   * alert already covered the drop moment, and the stage-2 "payout
   * confirmed" alert is reserved for Ocean's own ledger.
   */
  async insertDeducedMany(
    payouts: readonly DeducedPayoutInsert[],
    nowMs: number,
  ): Promise<number> {
    if (payouts.length === 0) return 0;
    const rows = payouts.map((p) => ({
      address: p.address,
      ts: p.ts_ms,
      on_chain_txid: null,
      net_sat: p.net_sat,
      is_generation: 0 as const,
      rail: p.rail,
      dedup_key: `${p.address}|dd:${p.ts_ms}`,
      enriched_alert: 1 as const,
      first_seen_at: nowMs,
      deduced: 1 as const,
    }));
    const result = await this.db
      .insertInto('ocean_payouts')
      .values(rows)
      .onConflict((oc) => oc.column('dedup_key').doNothing())
      .executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0);
  }

  /**
   * #343: supersede - remove deduced rows whose settlement showed up
   * in Ocean's own ledger after all (a laggy on-chain record, or a
   * future earnpay that starts returning Lightning). The real record
   * is authoritative; the deduced one was the placeholder.
   */
  async deleteByIds(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .deleteFrom('ocean_payouts')
      .where('id', 'in', ids as number[])
      .execute();
  }

  /**
   * #343: resolve deduced rows past the 24h correction window with no
   * matching earnpay settlement: on-chain payouts always surface in
   * earnpay, so what remains is - by elimination - a Lightning payout.
   */
  async resolveRailToLightning(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .updateTable('ocean_payouts')
      .set({ rail: 'lightning' })
      .where('id', 'in', ids as number[])
      .execute();
  }

  /**
   * #323 stage-2 alerts: payouts for an address not yet enriched
   * (enriched_alert = 0), oldest first. The alert evaluator fires one
   * "payout confirmed" message per row (rail-aware) then marks them.
   */
  async listUnenriched(address: string): Promise<OceanPayoutRow[]> {
    return this.db
      .selectFrom('ocean_payouts')
      .selectAll()
      .where('address', '=', address)
      .where('enriched_alert', '=', 0)
      .orderBy('ts', 'asc')
      .execute() as Promise<OceanPayoutRow[]>;
  }

  /** Mark the given payout rows as enriched (stage-2 alert sent). */
  async markEnriched(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .updateTable('ocean_payouts')
      .set({ enriched_alert: 1 })
      .where('id', 'in', ids as number[])
      .execute();
  }

  /**
   * Baseline: mark every stored payout for an address as enriched
   * without firing. Used once at evaluator startup so historical
   * payouts (including those a prior daemon version stored before the
   * stage-2 alert existed) don't flood Telegram on the first tick.
   */
  async markAllEnriched(address: string): Promise<void> {
    await this.db
      .updateTable('ocean_payouts')
      .set({ enriched_alert: 1 })
      .where('address', '=', address)
      .where('enriched_alert', '=', 0)
      .execute();
  }

  /**
   * #343: delete every stored payout for an address. Backs the P&L
   * "hard reset" - the service re-fetches the whole earnpay history and
   * re-inserts it, so the store ends up an exact copy of Ocean's ledger
   * with no stale rows. ocean_payouts is a leaf table (no FKs point at
   * it), so this can't cascade or orphan anything.
   */
  async deleteForAddress(address: string): Promise<void> {
    await this.db.deleteFrom('ocean_payouts').where('address', '=', address).execute();
  }

  /**
   * Sum of `net_sat` for the given address with `ts <= throughMs`.
   * This is lifetime "collected" for the P&L panel. Returns 0 when the
   * address has no payouts yet (fresh install / never paid).
   */
  async sumNetUpTo(address: string, throughMs: number): Promise<number> {
    const row = await this.db
      .selectFrom('ocean_payouts')
      .select((eb) => eb.fn.sum<number>('net_sat').as('s'))
      .where('address', '=', address)
      .where('ts', '<=', throughMs)
      .executeTakeFirst();
    return Number(row?.s ?? 0);
  }

  /**
   * Collected split by rail for the P&L breakdown (#323 decision 5).
   * `onchain + lightning === sumNetUpTo`.
   */
  async sumNetByRail(
    address: string,
    throughMs: number,
  ): Promise<{ onchain: number; lightning: number }> {
    const rows = await this.db
      .selectFrom('ocean_payouts')
      .select(['rail', (eb) => eb.fn.sum<number>('net_sat').as('s')])
      .where('address', '=', address)
      .where('ts', '<=', throughMs)
      .groupBy('rail')
      .execute();
    let onchain = 0;
    let lightning = 0;
    for (const r of rows) {
      // 'unknown' (a deduced payout inside its 24h correction window)
      // counts toward the Lightning bucket: it is by construction not
      // a confirmed on-chain settlement, and it resolves to
      // 'lightning' unless a real record supersedes it.
      if (r.rail === 'onchain') onchain += Number(r.s ?? 0);
      else lightning += Number(r.s ?? 0);
    }
    return { onchain, lightning };
  }

  /** Count of stored payouts for an address. Drives the "is the store empty, do a full backfill" decision. */
  async countForAddress(address: string): Promise<number> {
    const row = await this.db
      .selectFrom('ocean_payouts')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('address', '=', address)
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  /** All payouts for an address with `ts >= sinceMs`, oldest first. Feeds the chart gems. */
  async listForAddressSince(address: string, sinceMs: number): Promise<OceanPayoutRow[]> {
    return this.db
      .selectFrom('ocean_payouts')
      .selectAll()
      .where('address', '=', address)
      .where('ts', '>=', sinceMs)
      .orderBy('ts', 'asc')
      .execute() as Promise<OceanPayoutRow[]>;
  }
}
