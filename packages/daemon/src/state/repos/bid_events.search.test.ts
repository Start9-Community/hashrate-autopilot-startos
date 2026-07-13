import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type DatabaseHandle } from '../db.js';
import { BidEventsRepo, type BidEventInsert } from './bid_events.js';
import { EventNotesRepo } from './event_notes.js';

/**
 * #342: listEventsForHistory `textSearch` matches (case-insensitively)
 * against the bid id, the reason, AND the row's personal note. The term
 * is bound as a parameter with LIKE-wildcard escaping, so quotes/percent
 * signs are literal and can't inject.
 */
describe('BidEventsRepo.listEventsForHistory - textSearch (#342)', () => {
  let handle: DatabaseHandle;
  let repo: BidEventsRepo;
  let notes: EventNotesRepo;

  const ev = (
    over: Partial<BidEventInsert> & Pick<BidEventInsert, 'kind'>,
    occurred_at: number,
  ): BidEventInsert => ({
    occurred_at,
    source: 'AUTOPILOT',
    braiins_order_id: 'B123',
    old_price_sat: null,
    new_price_sat: 1_000_000,
    speed_limit_ph: 3,
    amount_sat: null,
    reason: null,
    overpay_sat_per_eh_day: null,
    max_overpay_vs_hashprice_sat_per_eh_day: null,
    ...over,
  });

  beforeEach(async () => {
    handle = await openDatabase({ path: ':memory:' });
    repo = new BidEventsRepo(handle.db);
    notes = new EventNotesRepo(handle.db);
    await repo.insert(ev({ kind: 'CANCEL_BID', braiins_order_id: 'B999', reason: 'Datum stratum down: 3 consecutive probes' }, 1_000));
    await repo.insert(ev({ kind: 'EDIT_PRICE', braiins_order_id: 'B123', reason: 'track fillable' }, 2_000));
    await repo.insert(ev({ kind: 'CREATE_BID', braiins_order_id: 'B123', reason: 'create at 50 sat' }, 3_000));
  });

  afterEach(async () => {
    await closeDatabase(handle);
  });

  it('matches the reason case-insensitively', async () => {
    const rows = await repo.listEventsForHistory({ limit: 100, textSearch: 'datum' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.braiins_order_id).toBe('B999');
  });

  it('still matches the bid id', async () => {
    const rows = await repo.listEventsForHistory({ limit: 100, textSearch: 'B999' });
    expect(rows).toHaveLength(1);
  });

  it('matches the row personal note (event_notes join)', async () => {
    // Note keyed by the EDIT_PRICE row's id (event:<id>).
    const all = await repo.listEventsForHistory({ limit: 100 });
    const editRow = all.find((r) => r.kind === 'EDIT_PRICE')!;
    await notes.set(`event:${editRow.id}`, 'the outage I was chasing');
    const rows = await repo.listEventsForHistory({ limit: 100, textSearch: 'chasing' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(editRow.id);
  });

  it('treats LIKE wildcards + quotes literally (no injection / over-match)', async () => {
    // '%' would match everything if unescaped; here it should match nothing.
    expect(await repo.listEventsForHistory({ limit: 100, textSearch: '%' })).toHaveLength(0);
    // A quote must not break the SQL; just matches nothing.
    expect(await repo.listEventsForHistory({ limit: 100, textSearch: "'; DROP TABLE bid_events;--" })).toHaveLength(0);
    // Sanity: the table survived the attempted injection.
    expect(await repo.listEventsForHistory({ limit: 100 })).toHaveLength(3);
  });
});
