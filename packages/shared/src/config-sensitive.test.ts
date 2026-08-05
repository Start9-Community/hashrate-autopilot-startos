import { describe, expect, it } from 'vitest';

import {
  SENSITIVE_CONFIG_FIELDS,
  CONFIG_VALUE_REDACTED,
  isSensitiveConfigField,
} from './config-sensitive.js';

describe('config-sensitive (GHSA-x8x9)', () => {
  it('flags credential fields as sensitive', () => {
    for (const f of [
      'telegram_bot_token',
      'bitcoind_rpc_user',
      'bitcoind_rpc_password',
      'ddns_username',
      'ddns_credential',
    ]) {
      expect(isSensitiveConfigField(f)).toBe(true);
      expect(SENSITIVE_CONFIG_FIELDS.has(f)).toBe(true);
    }
  });

  it('does NOT flag non-credential fields (auditable, not secrets)', () => {
    for (const f of [
      'btc_payout_address',
      'telegram_chat_id',
      'bitcoind_rpc_url',
      'ddns_hostname',
      'target_hashrate_ph',
      'max_bid_sat_per_eh_day',
    ]) {
      expect(isSensitiveConfigField(f)).toBe(false);
    }
  });

  it('has a redaction marker', () => {
    expect(CONFIG_VALUE_REDACTED).toBe('[redacted]');
  });
});
