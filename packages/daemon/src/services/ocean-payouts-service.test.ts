import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type DatabaseHandle } from '../state/db.js';
import { OceanPayoutsRepo } from '../state/repos/ocean_payouts.js';
import { OceanPayoutsService } from './ocean-payouts-service.js';
import type { OceanClient, OceanPayout } from './ocean.js';

const ADDR = 'bc1qux2aehp5ny89l9spguf052x84zm8h9uyfqvgdg';

/**
 * Minimal fake OceanClient: fetchPayouts returns a scripted queue of
 * responses (one per call), so a test can model "backfill sees N,
 * next refresh sees N+1". Only fetchPayouts is exercised here.
 */
function fakeClient(responses: Array<OceanPayout[] | null>): OceanClient {
  let call = 0;
  return {
    async fetchStats() { return null; },
    async fetchBlocksPage() { return []; },
    async fetchPayouts() {
      const r = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return r;
    },
  };
}

const p = (
  ts_ms: number,
  txid: string | null,
  net_sat: number,
): OceanPayout => ({ ts_ms, on_chain_txid: txid, net_sat, is_generation: false });

describe('OceanPayoutsService.syncOnce (#323)', () => {
  let handle: DatabaseHandle;
  let repo: OceanPayoutsRepo;

  beforeEach(async () => {
    handle = await openDatabase({ path: ':memory:' });
    repo = new OceanPayoutsRepo(handle.db);
  });

  afterEach(async () => {
    await closeDatabase(handle);
  });

  it('full-backfills on an empty store and marks those rows enriched (silent)', async () => {
    const svc = new OceanPayoutsService({
      oceanClient: fakeClient([[p(1000, 'a', 1_048_576), p(2000, null, 65_536)]]),
      repo,
      getAddress: () => ADDR,
    });
    await svc.syncOnce();

    // Both rails stored; collected = sum, split correct.
    expect(await repo.sumNetUpTo(ADDR, 9999)).toBe(1_048_576 + 65_536);
    expect(await repo.sumNetByRail(ADDR, 9999)).toEqual({
      onchain: 1_048_576,
      lightning: 65_536,
    });
    // Historical backfill is silent: nothing pending a stage-2 alert.
    expect(await repo.listUnenriched(ADDR)).toHaveLength(0);
    // The service now reports the address as synced/ready.
    expect(svc.getCollectedStatus(ADDR)).toBe('ready');
  });

  it('incremental refresh leaves a genuinely-new payout pending an alert', async () => {
    const svc = new OceanPayoutsService({
      oceanClient: fakeClient([
        [p(1000, 'a', 100)], // backfill (store empty) -> enriched
        [p(1000, 'a', 100), p(2000, 'b', 200)], // refresh -> 'b' is new
      ]),
      repo,
      getAddress: () => ADDR,
    });
    await svc.syncOnce(); // backfill
    expect(await repo.listUnenriched(ADDR)).toHaveLength(0);

    await svc.syncOnce(); // incremental
    const pending = await repo.listUnenriched(ADDR);
    expect(pending.map((r) => r.on_chain_txid)).toEqual(['b']);
    expect(await repo.sumNetUpTo(ADDR, 9999)).toBe(300);
  });

  it('is non-destructive when Ocean returns null (keeps last-known store)', async () => {
    const svc = new OceanPayoutsService({
      oceanClient: fakeClient([[p(1000, 'a', 500)], null]),
      repo,
      getAddress: () => ADDR,
    });
    await svc.syncOnce(); // backfill
    await svc.syncOnce(); // Ocean down -> null, must not wipe
    expect(await repo.sumNetUpTo(ADDR, 9999)).toBe(500);
  });

  it('does nothing without a payout address', async () => {
    const svc = new OceanPayoutsService({
      oceanClient: fakeClient([[p(1000, 'a', 500)]]),
      repo,
      getAddress: () => '',
    });
    await svc.syncOnce();
    expect(await repo.countForAddress(ADDR)).toBe(0);
    expect(svc.getCollectedStatus('')).toBe('idle');
  });
});
