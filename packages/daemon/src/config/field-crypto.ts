/**
 * Authenticated field encryption for secrets at rest (#331 / GHSA-wvpp).
 *
 * AES-256-GCM (Node built-in, no dependency). Each value gets a random
 * 12-byte IV; the field name is bound in as AAD so a ciphertext can't be
 * lifted from one column into another. Stored format:
 *
 *   enc:v1:<base64 iv>:<base64 (ciphertext || 16-byte tag)>
 *
 * The `enc:v1:` prefix distinguishes an encrypted value from a legacy
 * plaintext one, which keeps reads backward-compatible and the
 * encrypt-in-place migration idempotent.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Encrypt a plaintext for `field`. Returns the `enc:v1:...` envelope. */
export function encryptField(key: Buffer, field: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(field, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([ct, tag]);
  return `${PREFIX}${iv.toString('base64')}:${payload.toString('base64')}`;
}

/**
 * Decrypt an `enc:v1:` value for `field`. Throws if the key is wrong,
 * the value is tampered/malformed, or the field (AAD) doesn't match -
 * callers treat a throw as "secret unavailable" (see §3.5).
 */
export function decryptField(key: Buffer, field: string, stored: string): string {
  if (!isEncrypted(stored)) {
    throw new Error('not an encrypted value');
  }
  const rest = stored.slice(PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) throw new Error('malformed encrypted value');
  const iv = Buffer.from(rest.slice(0, sep), 'base64');
  const payload = Buffer.from(rest.slice(sep + 1), 'base64');
  if (iv.length !== IV_BYTES || payload.length < TAG_BYTES + 1) {
    throw new Error('malformed encrypted value');
  }
  const ct = payload.subarray(0, payload.length - TAG_BYTES);
  const tag = payload.subarray(payload.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(field, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
