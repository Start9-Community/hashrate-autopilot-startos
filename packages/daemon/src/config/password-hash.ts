/**
 * Dashboard-password hashing (#331 / GHSA-wvpp).
 *
 * The dashboard password is only ever *verified*, never recovered, so we
 * store a one-way scrypt hash instead of plaintext. Even a full read of
 * `state.db` then never reveals the password itself (which matters
 * because people reuse passwords).
 *
 * scrypt is a Node built-in (no dependency) and memory-hard. Params
 * N=2^15, r=8, p=1 are a sane interactive-login cost (~50-100 ms).
 *
 * Verification is deliberately dual-mode: a stored value that carries
 * our `scrypt$` prefix is scrypt-verified; anything else is treated as
 * plaintext and compared in constant time. That keeps the env / SOPS
 * secret sources working - an operator who sets `BHA_DASHBOARD_PASSWORD`
 * provides a plaintext value that never touches the DB and so is never
 * hashed.
 */

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const PREFIX = 'scrypt$';
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;
// scryptSync throws if N*r*p exceeds the default maxmem; raise it.
const MAXMEM = 128 * N * R * 2;

/** True when `stored` is one of our scrypt hashes (vs a plaintext password). */
export function isPasswordHashed(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** Produce a `scrypt$N$r$p$saltB64$hashB64` string for a plaintext password. */
export function hashPassword(plaintext: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(plaintext, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `${PREFIX}${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Constant-time verify of a presented plaintext against a stored value.
 * Handles both our scrypt hashes and legacy/env plaintext.
 */
export function verifyPassword(presented: string, stored: string): boolean {
  if (!isPasswordHashed(stored)) {
    // Plaintext (env / SOPS / pre-hash). Constant-time compare.
    return safeEqualStr(presented, stored);
  }
  const parts = stored.slice(PREFIX.length).split('$');
  if (parts.length !== 5) return false;
  const [nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64!, 'base64');
    expected = Buffer.from(hashB64!, 'base64');
  } catch {
    return false;
  }
  let derived: Buffer;
  try {
    derived = scryptSync(presented, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 128 * n * r * 2,
    });
  } catch {
    return false;
  }
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Constant-time string compare that doesn't leak length via early return. */
function safeEqualStr(a: string, b: string): boolean {
  // Hash both to a fixed width first so timingSafeEqual gets equal-length
  // buffers regardless of the inputs' lengths.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
