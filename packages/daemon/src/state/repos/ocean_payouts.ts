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

import type { Database } from '../types.js';

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
  rail: 'onchain' | 'lightning';
  dedup_key: string;
  enriched_alert: 0 | 1;
  first_seen_at: number;
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
      if (r.rail === 'lightning') lightning = Number(r.s ?? 0);
      else onchain = Number(r.s ?? 0);
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
