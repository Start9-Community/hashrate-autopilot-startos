import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Secrets } from '../../config/schema.js';
import { closeDatabase, openDatabase, type DatabaseHandle } from '../db.js';
import { SecretsRepo } from './secrets.js';
import { isPasswordHashed, verifyPassword } from '../../config/password-hash.js';

const VALID: Secrets = {
  braiins_owner_token: 'owner-tok',
  dashboard_password: 'pw-12345678',
};

describe('SecretsRepo', () => {
  let handle: DatabaseHandle;
  let repo: SecretsRepo;

  beforeEach(async () => {
    handle = await openDatabase({ path: ':memory:' });
    repo = new SecretsRepo(handle.db);
  });

  afterEach(async () => {
    await closeDatabase(handle);
  });

  it('returns null when no row exists', async () => {
    expect(await repo.get()).toBeNull();
    expect(await repo.exists()).toBe(false);
  });

  it('round-trips a minimum-valid secrets row (#331: password stored hashed)', async () => {
    await repo.upsert(VALID);
    expect(await repo.exists()).toBe(true);
    const out = await repo.get();
    // Non-password fields round-trip verbatim.
    expect(out!.braiins_owner_token).toBe(VALID.braiins_owner_token);
    // Password is a scrypt hash, not the plaintext, but verifies.
    expect(isPasswordHashed(out!.dashboard_password)).toBe(true);
    expect(out!.dashboard_password).not.toBe(VALID.dashboard_password);
    expect(verifyPassword(VALID.dashboard_password, out!.dashboard_password)).toBe(true);
  });

  it('round-trips a fully-populated secrets row', async () => {
    const full: Secrets = {
      braiins_owner_token: 'owner-tok',
      braiins_read_only_token: 'reader-tok',
      dashboard_password: 'pw-12345678',
      bitcoind_rpc_url: 'http://10.0.0.1:8332',
      bitcoind_rpc_user: 'rpc-user',
      bitcoind_rpc_password: 'rpc-pass',
    };
    await repo.upsert(full);
    const out = await repo.get();
    expect({ ...out, dashboard_password: undefined }).toEqual({
      ...full,
      dashboard_password: undefined,
    });
    expect(verifyPassword('pw-12345678', out!.dashboard_password)).toBe(true);
  });

  it('upsert is idempotent - replaces the existing row', async () => {
    await repo.upsert(VALID);
    await repo.upsert({ ...VALID, dashboard_password: 'new-pw-1234' });
    const out = await repo.get();
    expect(verifyPassword('new-pw-1234', out!.dashboard_password)).toBe(true);
    // Still exactly one row.
    const count = handle.raw
      .prepare('SELECT COUNT(*) as c FROM secrets')
      .get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('does not double-hash when re-upserting a value from get() (#331)', async () => {
    await repo.upsert(VALID);
    const first = await repo.get();
    // Feed the already-hashed value straight back in.
    await repo.upsert(first!);
    const second = await repo.get();
    expect(second!.dashboard_password).toBe(first!.dashboard_password);
    expect(verifyPassword(VALID.dashboard_password, second!.dashboard_password)).toBe(true);
  });

  it('ensurePasswordHashed upgrades a legacy plaintext row in place (#331)', async () => {
    // Simulate a pre-hashing install: write plaintext directly.
    handle.raw
      .prepare(
        'INSERT INTO secrets (id, braiins_owner_token, dashboard_password, updated_at) VALUES (1, ?, ?, ?)',
      )
      .run('owner-tok', 'legacy-plain-pw', Date.now());
    expect(await repo.ensurePasswordHashed()).toBe(true);
    const out = await repo.get();
    expect(isPasswordHashed(out!.dashboard_password)).toBe(true);
    expect(verifyPassword('legacy-plain-pw', out!.dashboard_password)).toBe(true);
    // Second call is a no-op.
    expect(await repo.ensurePasswordHashed()).toBe(false);
  });

  it('rejects an invalid input via schema validation', async () => {
    await expect(
      repo.upsert({ ...VALID, braiins_owner_token: '' } as Secrets),
    ).rejects.toThrow();
  });
});
