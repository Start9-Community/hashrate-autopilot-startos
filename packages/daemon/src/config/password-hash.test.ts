import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword, isPasswordHashed } from './password-hash.js';

describe('password-hash (#331)', () => {
  it('hashes to a prefixed, non-plaintext value', () => {
    const h = hashPassword('correct horse battery staple');
    expect(isPasswordHashed(h)).toBe(true);
    expect(h).not.toContain('correct horse');
    expect(h.startsWith('scrypt$')).toBe(true);
  });

  it('verifies the right password and rejects the wrong one', () => {
    const h = hashPassword('s3cret-pass');
    expect(verifyPassword('s3cret-pass', h)).toBe(true);
    expect(verifyPassword('s3cret-Pass', h)).toBe(false);
    expect(verifyPassword('', h)).toBe(false);
    expect(verifyPassword('s3cret-pass ', h)).toBe(false);
  });

  it('produces a different hash each time (random salt) but both verify', () => {
    const a = hashPassword('same');
    const b = hashPassword('same');
    expect(a).not.toBe(b);
    expect(verifyPassword('same', a)).toBe(true);
    expect(verifyPassword('same', b)).toBe(true);
  });

  it('falls back to plaintext compare for a non-hashed stored value (env/SOPS path)', () => {
    // An operator-provided plaintext password (BHA_DASHBOARD_PASSWORD) is
    // never hashed; verification must still work.
    expect(isPasswordHashed('plainpw')).toBe(false);
    expect(verifyPassword('plainpw', 'plainpw')).toBe(true);
    expect(verifyPassword('nope', 'plainpw')).toBe(false);
  });

  it('rejects a malformed hash without throwing', () => {
    expect(verifyPassword('x', 'scrypt$garbage')).toBe(false);
    expect(verifyPassword('x', 'scrypt$1$2$3$notbase64$@@')).toBe(false);
  });
});
