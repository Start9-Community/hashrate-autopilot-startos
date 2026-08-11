/**
 * #362: verify migration 0121 removes the phantom deduced payouts that a
 * negative ocean_unpaid_sat reading minted, nulls the impossible
 * readings themselves, and leaves legitimate deduced rows (and their
 * ids, so Timeline notes keyed `payout:<id>` survive) plus real earnpay
 * settlements untouched.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import SQLite from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADDR = 'bc1qd4glstkn28ey3cjct9je6v5cjmthvj8uydhd0d';
const MIN = 60_000;

/** The reported glitch tick, as it appears in the operator's export. */
const GLITCH_AT = 1_786_162_100_649;
/** A genuine payout, far outside the migration's +/- 30 min window. */
const REAL_DROP_AT = GLITCH_AT - 10 * 24 * 60 * 60 * 1000;

describe('migration 0121 - negative unpaid repair (#362)', () => {
  let db: SQLite.Database;

  beforeEach(() => {
    db = new SQLite(':memory:');
    db.exec(`
      CREATE TABLE tick_metrics (
        tick_at INTEGER PRIMARY KEY,
        ocean_unpaid_sat INTEGER
      );
      CREATE TABLE ocean_payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        ts INTEGER NOT NULL,
        net_sat INTEGER NOT NULL,
        rail TEXT NOT NULL,
        dedup_key TEXT NOT NULL UNIQUE,
        deduced INTEGER NOT NULL DEFAULT 0
      );
    `);

    const tick = db.prepare('INSERT INTO tick_metrics (tick_at, ocean_unpaid_sat) VALUES (?,?)');
    // Reported series: steady, two impossible readings, immediate recovery.
    tick.run(GLITCH_AT - 2 * MIN, 679_776);
    tick.run(GLITCH_AT - MIN, 679_776);
    tick.run(GLITCH_AT, -1);
    tick.run(GLITCH_AT + MIN, -1);
    tick.run(GLITCH_AT + 2 * MIN, 679_776);
    // A genuine payout elsewhere in history.
    tick.run(REAL_DROP_AT - MIN, 500_000);
    tick.run(REAL_DROP_AT, 0);
    tick.run(REAL_DROP_AT + MIN, 120);

    const payout = db.prepare(
      'INSERT INTO ocean_payouts (address, ts, net_sat, rail, dedup_key, deduced) VALUES (?,?,?,?,?,?)',
    );
    // The phantom: amount is pre-drop minus the -1.
    payout.run(ADDR, GLITCH_AT, 679_777, 'lightning', `${ADDR}|dd:${GLITCH_AT}`, 1);
    // A legitimate deduced payout that must survive with its id intact.
    payout.run(ADDR, REAL_DROP_AT, 500_000, 'lightning', `${ADDR}|dd:${REAL_DROP_AT}`, 1);
    // A real earnpay settlement - never the migration's business.
    payout.run(ADDR, REAL_DROP_AT, 495_000, 'onchain', `${ADDR}|tx:abc123`, 0);
  });

  afterEach(() => db.close());

  async function run(): Promise<void> {
    db.exec(await readFile(join(HERE, '0121_negative_unpaid_repair.sql'), 'utf8'));
  }

  it('deletes the phantom row and keeps the legitimate deduced row with its id', async () => {
    const legitIdBefore = db
      .prepare('SELECT id FROM ocean_payouts WHERE dedup_key = ?')
      .get(`${ADDR}|dd:${REAL_DROP_AT}`) as { id: number };

    await run();

    const rows = db
      .prepare('SELECT id, net_sat, dedup_key, deduced FROM ocean_payouts ORDER BY id')
      .all() as Array<{ id: number; net_sat: number; dedup_key: string; deduced: number }>;

    expect(rows.map((r) => r.net_sat).sort((a, b) => a - b)).toEqual([495_000, 500_000]);
    expect(rows.some((r) => r.net_sat === 679_777)).toBe(false);

    // The surviving deduced row keeps its id, so `payout:<id>` Timeline
    // notes stay attached.
    const legit = rows.find((r) => r.dedup_key === `${ADDR}|dd:${REAL_DROP_AT}`);
    expect(legit?.id).toBe(legitIdBefore.id);

    // The real earnpay settlement is untouched.
    expect(rows.some((r) => r.dedup_key === `${ADDR}|tx:abc123` && r.deduced === 0)).toBe(true);
  });

  it('nulls the impossible readings and leaves every valid one alone', async () => {
    await run();

    const negatives = db
      .prepare('SELECT COUNT(*) AS n FROM tick_metrics WHERE ocean_unpaid_sat < 0')
      .get() as { n: number };
    expect(negatives.n).toBe(0);

    const nulled = db
      .prepare('SELECT COUNT(*) AS n FROM tick_metrics WHERE ocean_unpaid_sat IS NULL')
      .get() as { n: number };
    expect(nulled.n).toBe(2);

    // Valid readings survive verbatim, including the ones bracketing the glitch.
    const kept = db
      .prepare('SELECT ocean_unpaid_sat AS v FROM tick_metrics WHERE ocean_unpaid_sat IS NOT NULL ORDER BY tick_at')
      .all() as Array<{ v: number }>;
    expect(kept.map((r) => r.v)).toEqual([500_000, 0, 120, 679_776, 679_776, 679_776]);
  });

  it('is idempotent - a second run changes nothing', async () => {
    await run();
    const after1 = db.prepare('SELECT COUNT(*) AS n FROM ocean_payouts').get() as { n: number };

    await run();
    const after2 = db.prepare('SELECT COUNT(*) AS n FROM ocean_payouts').get() as { n: number };

    expect(after2.n).toBe(after1.n);
  });
});
