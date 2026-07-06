import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type DatabaseHandle } from '../db.js';
import { OceanPayoutsRepo, payoutDedupKey } from './ocean_payouts.js';

const ADDR = 'bc1qux2aehp5ny89l9spguf052x84zm8h9uyfqvgdg';
const OTHER = 'bc1qother0000000000000000000000000000000';

describe('OceanPayoutsRepo (#323)', () => {
  let handle: DatabaseHandle;
  let repo: OceanPayoutsRepo;

  beforeEach(async () => {
    handle = await openDatabase({ path: ':memory:' });
    repo = new OceanPayoutsRepo(handle.db);
  });

  afterEach(async () => {
    await closeDatabase(handle);
  });

  it('starts empty', async () => {
    expect(await repo.countForAddress(ADDR)).toBe(0);
    expect(await repo.sumNetUpTo(ADDR, Date.now())).toBe(0);
    expect(await repo.sumNetByRail(ADDR, Date.now())).toEqual({
      onchain: 0,
      lightning: 0,
    });
  });

  it('sums on-chain and Lightning payouts into a single collected total, split by rail', async () => {
    const inserted = await repo.upsertMany(
      [
        { address: ADDR, ts_ms: 1_000, on_chain_txid: 'aaaa', net_sat: 1_048_576, is_generation: false },
        { address: ADDR, ts_ms: 2_000, on_chain_txid: 'bbbb', net_sat: 2_000_000, is_generation: true },
        // Lightning payout: no txid, off-chain. This is the whole point -
        // the on-chain scanner could never see this, so P&L understated.
        { address: ADDR, ts_ms: 3_000, on_chain_txid: null, net_sat: 12_345, is_generation: false },
      ],
      Date.now(),
    );
    expect(inserted).toBe(3);

    expect(await repo.sumNetUpTo(ADDR, 5_000)).toBe(1_048_576 + 2_000_000 + 12_345);
    expect(await repo.sumNetByRail(ADDR, 5_000)).toEqual({
      onchain: 1_048_576 + 2_000_000,
      lightning: 12_345,
    });
  });

  it('honours the through-timestamp bound', async () => {
    await repo.upsertMany(
      [
        { address: ADDR, ts_ms: 1_000, on_chain_txid: 'a', net_sat: 100, is_generation: false },
        { address: ADDR, ts_ms: 9_000, on_chain_txid: 'b', net_sat: 900, is_generation: false },
      ],
      Date.now(),
    );
    expect(await repo.sumNetUpTo(ADDR, 5_000)).toBe(100);
    expect(await repo.sumNetUpTo(ADDR, 10_000)).toBe(1_000);
  });

  it('is idempotent: re-upserting the same on-chain payout inserts nothing new', async () => {
    const row = { address: ADDR, ts_ms: 1_000, on_chain_txid: 'dup', net_sat: 500, is_generation: false };
    expect(await repo.upsertMany([row], Date.now())).toBe(1);
    expect(await repo.upsertMany([row], Date.now())).toBe(0);
    expect(await repo.countForAddress(ADDR)).toBe(1);
    expect(await repo.sumNetUpTo(ADDR, 5_000)).toBe(500);
  });

  it('dedups Lightning payouts by ts+amount despite the null txid', async () => {
    const ln = { address: ADDR, ts_ms: 7_000, on_chain_txid: null, net_sat: 4_242, is_generation: false };
    expect(await repo.upsertMany([ln], Date.now())).toBe(1);
    // Second sync of an overlapping window re-sees the same payout.
    expect(await repo.upsertMany([ln], Date.now())).toBe(0);
    expect(await repo.countForAddress(ADDR)).toBe(1);
  });

  it('scopes sums to the current address so an address change reflects only its payouts', async () => {
    await repo.upsertMany(
      [{ address: OTHER, ts_ms: 1_000, on_chain_txid: 'old', net_sat: 999_999, is_generation: false }],
      Date.now(),
    );
    await repo.upsertMany(
      [{ address: ADDR, ts_ms: 2_000, on_chain_txid: 'new', net_sat: 111, is_generation: false }],
      Date.now(),
    );
    expect(await repo.sumNetUpTo(ADDR, 5_000)).toBe(111);
    expect(await repo.sumNetUpTo(OTHER, 5_000)).toBe(999_999);
  });

  it('lists payouts for the chart with rail derived from txid presence', async () => {
    await repo.upsertMany(
      [
        { address: ADDR, ts_ms: 1_000, on_chain_txid: 'x', net_sat: 100, is_generation: false },
        { address: ADDR, ts_ms: 2_000, on_chain_txid: null, net_sat: 200, is_generation: false },
      ],
      Date.now(),
    );
    const rows = await repo.listForAddressSince(ADDR, 0);
    expect(rows.map((r) => r.rail)).toEqual(['onchain', 'lightning']);
    expect(rows.map((r) => r.on_chain_txid)).toEqual(['x', null]);
  });

  it('builds distinct dedup keys per rail', () => {
    expect(
      payoutDedupKey({ address: ADDR, ts_ms: 1, on_chain_txid: 'tx', net_sat: 5, is_generation: false }),
    ).toBe(`${ADDR}|oc:tx`);
    expect(
      payoutDedupKey({ address: ADDR, ts_ms: 1, on_chain_txid: null, net_sat: 5, is_generation: false }),
    ).toBe(`${ADDR}|ln:1:5`);
  });
});
