/**
 * Resolves the at-rest encryption key (#331 / GHSA-wvpp), mirroring the
 * daemon's layered secret-source pattern. Order (first available wins):
 *
 *   1. BHA_SECRET_KEY        - env var. Portable. On Umbrel our compose
 *                              sets it to ${APP_SEED} (a per-app secret
 *                              derived from the device seed, outside the
 *                              app's data dir). On generic Docker / bare
 *                              metal the operator sets it however they
 *                              like.
 *   2. BHA_SECRET_KEY_FILE   - path to a file holding the key material
 *                              (e.g. a Docker secret at /run/secrets/...).
 *   3. Generated keyfile      - `<dataDir>/secret.key`, 0600, 32 random
 *                              bytes. Zero-config fallback. Honest
 *                              limitation: it sits next to state.db, so
 *                              it defeats DB-only leaks but not a
 *                              full-data-dir backup.
 *
 * The resolved *material* (any string / bytes) is run through HKDF-SHA256
 * to produce the 32-byte AES key, so operators can use any passphrase.
 */

import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { hkdfSync, randomBytes } from 'node:crypto';

const HKDF_SALT = 'hashrate-autopilot::secret-key::v1';
const HKDF_INFO = 'aes-256-gcm field key';
const KEYFILE_NAME = 'secret.key';

export type SecretKeySource = 'env' | 'env-file' | 'keyfile';

export interface ResolvedSecretKey {
  readonly key: Buffer; // 32 bytes, ready for AES-256-GCM
  readonly source: SecretKeySource;
}

export interface ResolveSecretKeyOptions {
  readonly dataDir: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly log?: (msg: string) => void;
}

function deriveKey(material: string | Buffer): Buffer {
  const ikm = typeof material === 'string' ? Buffer.from(material, 'utf8') : material;
  // hkdfSync returns an ArrayBuffer; wrap it.
  return Buffer.from(hkdfSync('sha256', ikm, Buffer.from(HKDF_SALT), Buffer.from(HKDF_INFO), 32));
}

/**
 * Resolve (and, for the keyfile fallback, generate) the encryption key.
 * Always returns a key - the keyfile is created on first use so the
 * daemon never boots without one.
 */
export function resolveSecretKey(opts: ResolveSecretKeyOptions): ResolvedSecretKey {
  const env = opts.env ?? process.env;

  const direct = env['BHA_SECRET_KEY'];
  if (direct && direct.length > 0) {
    return { key: deriveKey(direct), source: 'env' };
  }

  const filePath = env['BHA_SECRET_KEY_FILE'];
  if (filePath && filePath.length > 0) {
    const material = readFileSync(filePath, 'utf8').trim();
    if (material.length === 0) {
      throw new Error(`BHA_SECRET_KEY_FILE (${filePath}) is empty`);
    }
    return { key: deriveKey(material), source: 'env-file' };
  }

  // Generated keyfile fallback.
  const keyfile = join(opts.dataDir, KEYFILE_NAME);
  let material: string;
  if (existsSync(keyfile)) {
    material = readFileSync(keyfile, 'utf8').trim();
    if (material.length === 0) {
      // Empty/corrupt keyfile: regenerate rather than derive a null key.
      material = randomBytes(32).toString('base64');
      writeFileSync(keyfile, material, { mode: 0o600 });
      opts.log?.('[secret-key] regenerated an empty keyfile');
    }
  } else {
    material = randomBytes(32).toString('base64');
    writeFileSync(keyfile, material, { mode: 0o600 });
    opts.log?.(`[secret-key] generated ${KEYFILE_NAME} (set BHA_SECRET_KEY to keep the key off this volume)`);
  }
  try {
    chmodSync(keyfile, 0o600);
  } catch {
    /* best-effort perms tighten */
  }
  return { key: deriveKey(material), source: 'keyfile' };
}
