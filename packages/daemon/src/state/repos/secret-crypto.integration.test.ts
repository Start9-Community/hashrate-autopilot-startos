import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type DatabaseHandle } from '../db.js';
import { SecretsRepo } from './secrets.js';
import { ConfigRepo } from './config.js';
import { SecretCrypto } from '../../config/secret-crypto.js';
import { APP_CONFIG_DEFAULTS, type AppConfig, type Secrets } from '../../config/schema.js';

const keyA = () => new SecretCrypto(Buffer.alloc(32, 1));
const keyB = () => new SecretCrypto(Buffer.alloc(32, 2));

const SECRETS: Secrets = {
  braiins_owner_token: 'OWNER-abc',
  braiins_read_only_token: 'READER-def',
  dashboard_password: 'pw-12345678',
  bitcoind_rpc_password: 'rpc-ghi',
  telegram_bot_token: 'tg-jkl',
};

const CONFIG: AppConfig = {
  ...APP_CONFIG_DEFAULTS,
  destination_pool_url: 'stratum+tcp://datum.local:23334',
  destination_pool_worker_name: 'remco.rig1',
  btc_payout_address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
  telegram_bot_token: 'tg-token-SECRET',
  bitcoind_rpc_password: 'rpc-pass-SECRET',
  ddns_credential: 'ddns-SECRET',
  bitcoind_rpc_user: 'rpcuser',
} as AppConfig;

describe('SecretsRepo field encryption (#331)', () => {
  let handle: DatabaseHandle;
  beforeEach(async () => { handle = await openDatabase({ path: ':memory:' }); });
  afterEach(async () => { await closeDatabase(handle); });

  it('stores secret columns encrypted but returns them decrypted', async () => {
    const repo = new SecretsRepo(handle.db, keyA());
    await repo.upsert(SECRETS);
    // Raw DB value is ciphertext.
    const raw = handle.raw
      .prepare('SELECT braiins_owner_token, telegram_bot_token FROM secrets WHERE id=1')
      .get() as { braiins_owner_token: string; telegram_bot_token: string };
    expect(raw.braiins_owner_token.startsWith('enc:v1:')).toBe(true);
    expect(raw.braiins_owner_token).not.toContain('OWNER-abc');
    expect(raw.telegram_bot_token.startsWith('enc:v1:')).toBe(true);
    // get() decrypts.
    const out = await repo.get();
    expect(out!.braiins_owner_token).toBe('OWNER-abc');
    expect(out!.telegram_bot_token).toBe('tg-jkl');
    expect(out!.bitcoind_rpc_password).toBe('rpc-ghi');
  });

  it('ensureEncrypted upgrades a legacy plaintext row', async () => {
    // Write plaintext directly (pre-encryption install).
    handle.raw
      .prepare('INSERT INTO secrets (id, braiins_owner_token, dashboard_password, telegram_bot_token, updated_at) VALUES (1,?,?,?,?)')
      .run('OWNER-plain', 'scrypt$hash', 'tg-plain', Date.now());
    const repo = new SecretsRepo(handle.db, keyA());
    const n = await repo.ensureEncrypted();
    expect(n).toBe(2); // owner + telegram
    const raw = handle.raw.prepare('SELECT braiins_owner_token FROM secrets WHERE id=1').get() as { braiins_owner_token: string };
    expect(raw.braiins_owner_token.startsWith('enc:v1:')).toBe(true);
    expect((await repo.get())!.braiins_owner_token).toBe('OWNER-plain');
    // Idempotent.
    expect(await repo.ensureEncrypted()).toBe(0);
  });

  it('returns null when the owner token cannot be decrypted (wrong key -> NEEDS_SETUP)', async () => {
    await new SecretsRepo(handle.db, keyA()).upsert(SECRETS);
    const out = await new SecretsRepo(handle.db, keyB()).get();
    expect(out).toBeNull();
  });

  it('legacy plaintext still reads through with crypto wired', async () => {
    handle.raw
      .prepare('INSERT INTO secrets (id, braiins_owner_token, dashboard_password, updated_at) VALUES (1,?,?,?)')
      .run('OWNER-legacy', 'scrypt$hash', Date.now());
    const out = await new SecretsRepo(handle.db, keyA()).get();
    expect(out!.braiins_owner_token).toBe('OWNER-legacy');
  });

  it('#332 setDashboardPassword rotates the hash in place and returns it', async () => {
    const repo = new SecretsRepo(handle.db, keyA());
    await repo.upsert(SECRETS);
    const hash = await repo.setDashboardPassword('brand-new-pw');
    expect(hash).not.toBeNull();
    expect(hash!.startsWith('scrypt$')).toBe(true);
    // The returned hash matches what's stored + verifies the new password.
    const out = await repo.get();
    expect(out!.dashboard_password).toBe(hash);
    // Old password no longer verifies (see password-hash tests); new does.
  });

  it('#332 setDashboardPassword returns null when there is no secrets row', async () => {
    expect(await new SecretsRepo(handle.db, keyA()).setDashboardPassword('x')).toBeNull();
  });

  it('#332 setBraiinsToken stores the token encrypted and reads back decrypted', async () => {
    const repo = new SecretsRepo(handle.db, keyA());
    await repo.upsert(SECRETS);
    expect(await repo.setBraiinsToken('owner', 'ROTATED-OWNER')).toBe(true);
    const raw = handle.raw
      .prepare('SELECT braiins_owner_token FROM secrets WHERE id=1')
      .get() as { braiins_owner_token: string };
    expect(raw.braiins_owner_token.startsWith('enc:v1:')).toBe(true);
    expect(raw.braiins_owner_token).not.toContain('ROTATED-OWNER');
    expect((await repo.get())!.braiins_owner_token).toBe('ROTATED-OWNER');
  });
});

describe('ConfigRepo field encryption (#331)', () => {
  let handle: DatabaseHandle;
  beforeEach(async () => { handle = await openDatabase({ path: ':memory:' }); });
  afterEach(async () => { await closeDatabase(handle); });

  it('encrypts config secrets at rest, decrypts on read, leaves username plaintext', async () => {
    const repo = new ConfigRepo(handle.db, keyA());
    await repo.upsert(CONFIG);
    const raw = handle.raw
      .prepare('SELECT telegram_bot_token, bitcoind_rpc_password, ddns_credential, bitcoind_rpc_user FROM config WHERE id=1')
      .get() as Record<string, string>;
    expect(raw.telegram_bot_token.startsWith('enc:v1:')).toBe(true);
    expect(raw.bitcoind_rpc_password.startsWith('enc:v1:')).toBe(true);
    expect(raw.ddns_credential.startsWith('enc:v1:')).toBe(true);
    expect(raw.bitcoind_rpc_user).toBe('rpcuser'); // not a secret, plaintext
    const out = await repo.get();
    expect(out!.telegram_bot_token).toBe('tg-token-SECRET');
    expect(out!.bitcoind_rpc_password).toBe('rpc-pass-SECRET');
    expect(out!.ddns_credential).toBe('ddns-SECRET');
  });

  it('ensureEncrypted upgrades legacy plaintext config secrets', async () => {
    await new ConfigRepo(handle.db).upsert(CONFIG); // no crypto -> plaintext
    const repo = new ConfigRepo(handle.db, keyA());
    expect(await repo.ensureEncrypted()).toBe(3);
    expect(await repo.ensureEncrypted()).toBe(0); // idempotent
    expect((await repo.get())!.telegram_bot_token).toBe('tg-token-SECRET');
  });

  it('surfaces an undecryptable config secret as empty (graceful)', async () => {
    await new ConfigRepo(handle.db, keyA()).upsert(CONFIG);
    const out = await new ConfigRepo(handle.db, keyB()).get();
    expect(out!.telegram_bot_token).toBe('');
    expect(out!.bitcoind_rpc_password).toBe('');
    // Non-secret fields unaffected.
    expect(out!.bitcoind_rpc_user).toBe('rpcuser');
  });
});
