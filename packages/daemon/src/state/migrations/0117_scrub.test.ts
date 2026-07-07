/**
 * GHSA-x8x9: verify migration 0117 scrubs credential values out of
 * existing config_change system_events rows while leaving non-sensitive
 * config changes (and other event kinds) untouched.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import SQLite from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('migration 0117 - scrub config_change secrets', () => {
  let db: SQLite.Database;

  beforeEach(() => {
    db = new SQLite(':memory:');
    db.exec(`
      CREATE TABLE system_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        field TEXT,
        old_value TEXT,
        new_value TEXT,
        detail TEXT
      );
    `);
    const ins = db.prepare(
      'INSERT INTO system_events (occurred_at, kind, field, old_value, new_value) VALUES (?,?,?,?,?)',
    );
    // Sensitive - must be scrubbed.
    ins.run(1, 'config_change', 'telegram_bot_token', '123:OLD-SECRET', '123:NEW-SECRET');
    ins.run(2, 'config_change', 'bitcoind_rpc_password', 'hunter2', 'hunter3');
    ins.run(3, 'config_change', 'ddns_credential', 'ddns-old', 'ddns-new');
    // Non-sensitive - must stay intact.
    ins.run(4, 'config_change', 'target_hashrate_ph', '1', '3');
    ins.run(5, 'config_change', 'btc_payout_address', 'bc1qold', 'bc1qnew');
    // Different kind - must stay intact even if field name collides.
    ins.run(6, 'daemon_started', 'telegram_bot_token', 'not-a-secret', 'also-not');
  });

  afterEach(() => db.close());

  it('redacts sensitive config_change values, preserves the rest', async () => {
    const sql = await readFile(join(HERE, '0117_scrub_config_change_secrets.sql'), 'utf8');
    db.exec(sql);

    const rows = db
      .prepare('SELECT field, kind, old_value, new_value FROM system_events ORDER BY id')
      .all() as Array<{ field: string; kind: string; old_value: string; new_value: string }>;

    // Sensitive config_change rows -> both values redacted.
    for (const f of ['telegram_bot_token', 'bitcoind_rpc_password', 'ddns_credential']) {
      const r = rows.find((x) => x.field === f && x.kind === 'config_change')!;
      expect(r.old_value).toBe('[redacted]');
      expect(r.new_value).toBe('[redacted]');
    }
    // No leftover secret substrings anywhere.
    const dump = JSON.stringify(rows);
    for (const secret of ['OLD-SECRET', 'NEW-SECRET', 'hunter2', 'hunter3', 'ddns-old', 'ddns-new']) {
      expect(dump).not.toContain(secret);
    }
    // Non-sensitive config_change untouched.
    expect(rows.find((x) => x.field === 'target_hashrate_ph')!.new_value).toBe('3');
    expect(rows.find((x) => x.field === 'btc_payout_address')!.new_value).toBe('bc1qnew');
    // Non-config_change kind untouched even with a matching field name.
    const boot = rows.find((x) => x.kind === 'daemon_started')!;
    expect(boot.old_value).toBe('not-a-secret');
  });
});
