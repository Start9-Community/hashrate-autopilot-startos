import { describe, expect, it } from 'vitest';

import { maskCredentials, keepCredentials } from './config.js';
import type { AppConfig } from '../../config/schema.js';

// A minimal-but-typed config stub; only the fields under test matter.
const base = {
  telegram_bot_token: 'bot:SECRET',
  bitcoind_rpc_password: 'rpcpass',
  ddns_credential: 'ddns-secret',
  bitcoind_rpc_user: 'rpcuser',
  btc_payout_address: 'bc1qexample',
  target_hashrate_ph: 3,
} as unknown as AppConfig;

describe('config write-only credentials (#331)', () => {
  it('GET masks the true secrets and reports which are set', () => {
    const { config, credentials_set } = maskCredentials(base);
    expect((config as Record<string, unknown>).telegram_bot_token).toBe('');
    expect((config as Record<string, unknown>).bitcoind_rpc_password).toBe('');
    expect((config as Record<string, unknown>).ddns_credential).toBe('');
    // Username stays visible - it's not a secret.
    expect((config as Record<string, unknown>).bitcoind_rpc_user).toBe('rpcuser');
    expect((config as Record<string, unknown>).btc_payout_address).toBe('bc1qexample');
    expect(credentials_set).toMatchObject({
      telegram_bot_token: true,
      bitcoind_rpc_password: true,
      ddns_credential: true,
    });
  });

  it('reports a not-configured secret as false', () => {
    const { credentials_set } = maskCredentials({
      ...base,
      telegram_bot_token: '',
    } as AppConfig);
    expect(credentials_set.telegram_bot_token).toBe(false);
  });

  it('PUT keeps a set secret when the incoming value is blank', () => {
    const incoming = {
      ...base,
      telegram_bot_token: '', // left blank = keep
      bitcoind_rpc_password: 'newpass', // changed
      ddns_credential: '', // left blank = keep
    } as AppConfig;
    const merged = keepCredentials(incoming, base) as Record<string, unknown>;
    expect(merged.telegram_bot_token).toBe('bot:SECRET'); // kept
    expect(merged.bitcoind_rpc_password).toBe('newpass'); // updated
    expect(merged.ddns_credential).toBe('ddns-secret'); // kept
  });

  it('PUT does not resurrect a value when there was none to keep', () => {
    const prev = { ...base, telegram_bot_token: '' } as AppConfig;
    const incoming = { ...base, telegram_bot_token: '' } as AppConfig;
    const merged = keepCredentials(incoming, prev) as Record<string, unknown>;
    expect(merged.telegram_bot_token).toBe('');
  });
});
