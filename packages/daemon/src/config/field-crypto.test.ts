import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { encryptField, decryptField, isEncrypted } from './field-crypto.js';
import { resolveSecretKey } from './secret-key.js';

const KEY = Buffer.alloc(32, 7);

describe('field-crypto (#331)', () => {
  it('round-trips a value', () => {
    const enc = encryptField(KEY, 'braiins_owner_token', 'tok-SECRET-123');
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain('SECRET');
    expect(decryptField(KEY, 'braiins_owner_token', enc)).toBe('tok-SECRET-123');
  });

  it('produces a fresh IV each time (different ciphertext, same plaintext)', () => {
    const a = encryptField(KEY, 'f', 'x');
    const b = encryptField(KEY, 'f', 'x');
    expect(a).not.toBe(b);
    expect(decryptField(KEY, 'f', a)).toBe('x');
  });

  it('fails to decrypt with the wrong key', () => {
    const enc = encryptField(KEY, 'f', 'secret');
    expect(() => decryptField(Buffer.alloc(32, 9), 'f', enc)).toThrow();
  });

  it('fails to decrypt under the wrong field (AAD binding)', () => {
    const enc = encryptField(KEY, 'telegram_bot_token', 'secret');
    expect(() => decryptField(KEY, 'bitcoind_rpc_password', enc)).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const enc = encryptField(KEY, 'f', 'secret');
    const tampered = enc.slice(0, -2) + (enc.endsWith('A') ? 'B' : 'A');
    expect(() => decryptField(KEY, 'f', tampered)).toThrow();
  });

  it('throws on a non-encrypted value', () => {
    expect(() => decryptField(KEY, 'f', 'plaintext')).toThrow();
  });
});

describe('resolveSecretKey (#331)', () => {
  const dirs: string[] = [];
  const mk = () => {
    const d = mkdtempSync(join(tmpdir(), 'sk-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('prefers BHA_SECRET_KEY env', () => {
    const r = resolveSecretKey({ dataDir: mk(), env: { BHA_SECRET_KEY: 'passphrase' } });
    expect(r.source).toBe('env');
    expect(r.key.length).toBe(32);
  });

  it('is deterministic for the same env material', () => {
    const a = resolveSecretKey({ dataDir: mk(), env: { BHA_SECRET_KEY: 'same' } });
    const b = resolveSecretKey({ dataDir: mk(), env: { BHA_SECRET_KEY: 'same' } });
    expect(a.key.equals(b.key)).toBe(true);
  });

  it('generates a 0600 keyfile fallback and reuses it', () => {
    const dir = mk();
    const a = resolveSecretKey({ dataDir: dir, env: {} });
    expect(a.source).toBe('keyfile');
    const kf = join(dir, 'secret.key');
    expect(existsSync(kf)).toBe(true);
    expect(statSync(kf).mode & 0o777).toBe(0o600);
    // Second resolve reuses the same material -> same key.
    const b = resolveSecretKey({ dataDir: dir, env: {} });
    expect(a.key.equals(b.key)).toBe(true);
  });

  it('encrypt with env key, decrypt survives a restart (same env)', () => {
    const dir = mk();
    const k1 = resolveSecretKey({ dataDir: dir, env: { BHA_SECRET_KEY: 'stable' } });
    const enc = encryptField(k1.key, 'braiins_owner_token', 'v');
    const k2 = resolveSecretKey({ dataDir: dir, env: { BHA_SECRET_KEY: 'stable' } });
    expect(decryptField(k2.key, 'braiins_owner_token', enc)).toBe('v');
  });
});
