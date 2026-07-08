/**
 * Repository for the single-row `secrets` table.
 *
 * Populated by the first-run web wizard (#57) so appliance installs
 * (Umbrel, Start9) can persist their owner-token + dashboard-password
 * + optional bitcoind RPC creds inside the same SQLite file the
 * appliance backs up - no SOPS file required.
 *
 * Power-user SOPS path is unchanged: when `.env.sops.yaml` exists the
 * daemon prefers it. This repo is only consulted when no SOPS file is
 * present and no env-var-based bootstrap supplied complete secrets.
 */

import type { Kysely } from 'kysely';

import { SecretsSchema, type Secrets } from '../../config/schema.js';
import { hashPassword, isPasswordHashed } from '../../config/password-hash.js';
import { SecretCrypto, SECRETS_ENCRYPTED_FIELDS } from '../../config/secret-crypto.js';
import type { Database } from '../types.js';

export class SecretsRepo {
  /**
   * #331: optional field-encryption. When wired, secret columns are
   * encrypted at rest and decrypted on read. Absent (unit tests) the
   * repo stores plaintext exactly as before.
   */
  constructor(
    private readonly db: Kysely<Database>,
    private readonly crypto?: SecretCrypto,
  ) {}

  /**
   * Return the persisted secrets, or null if the wizard hasn't run.
   * Callers should treat null as "first-run setup not completed."
   */
  async get(): Promise<Secrets | null> {
    const row = await this.db
      .selectFrom('secrets')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirst();
    if (!row) return null;
    // #331: decrypt the encrypted secret columns. A decrypt failure
    // (wrong/lost key) yields null -> treat that secret as unavailable.
    // If a REQUIRED secret can't be decrypted, report the whole set as
    // missing so the daemon falls into NEEDS_SETUP instead of booting
    // with a broken owner token (§3.5).
    const dec = (field: string, v: string | null): string | null =>
      v == null || v === '' ? null : this.crypto ? this.crypto.decrypt(field, v) : v;
    const owner = dec('braiins_owner_token', row.braiins_owner_token);
    if (owner == null) return null;
    // Drop columns that aren't part of SecretsSchema; pass the rest
    // through Zod so a row hand-edited to be invalid surfaces a clear
    // schema error rather than silently flowing into the daemon.
    const candidate: Record<string, string | undefined> = {
      braiins_owner_token: owner,
      dashboard_password: row.dashboard_password,
    };
    const reader = dec('braiins_read_only_token', row.braiins_read_only_token);
    if (reader) candidate['braiins_read_only_token'] = reader;
    if (row.bitcoind_rpc_url) candidate['bitcoind_rpc_url'] = row.bitcoind_rpc_url;
    if (row.bitcoind_rpc_user) candidate['bitcoind_rpc_user'] = row.bitcoind_rpc_user;
    const rpcPass = dec('bitcoind_rpc_password', row.bitcoind_rpc_password);
    if (rpcPass) candidate['bitcoind_rpc_password'] = rpcPass;
    const tgToken = dec('telegram_bot_token', row.telegram_bot_token);
    if (tgToken) candidate['telegram_bot_token'] = tgToken;
    return SecretsSchema.parse(candidate);
  }

  /**
   * Insert or replace the secrets row. Validates via the same schema
   * the SOPS loader uses, so any row this repo writes is guaranteed
   * to round-trip cleanly through `loadSecrets()`-style consumers.
   */
  async upsert(secrets: Secrets, now: number = Date.now()): Promise<void> {
    const validated = SecretsSchema.parse(secrets);
    // #331: store a one-way scrypt hash of the dashboard password, never
    // the plaintext. Guard against double-hashing when a caller re-upserts
    // a secrets object that already came from get() (already hashed).
    const storedPassword = isPasswordHashed(validated.dashboard_password)
      ? validated.dashboard_password
      : hashPassword(validated.dashboard_password);
    // #331: encrypt the secret columns at rest (no-op without crypto).
    const enc = (field: string, v: string | null | undefined): string | null =>
      v == null || v === '' ? (v ?? null) : this.crypto ? this.crypto.encrypt(field, v) : v;
    const row = {
      braiins_owner_token: enc('braiins_owner_token', validated.braiins_owner_token)!,
      braiins_read_only_token: enc('braiins_read_only_token', validated.braiins_read_only_token),
      dashboard_password: storedPassword,
      bitcoind_rpc_url: validated.bitcoind_rpc_url ?? null,
      bitcoind_rpc_user: validated.bitcoind_rpc_user ?? null,
      bitcoind_rpc_password: enc('bitcoind_rpc_password', validated.bitcoind_rpc_password),
      telegram_bot_token: enc('telegram_bot_token', validated.telegram_bot_token),
    };
    await this.db
      .insertInto('secrets')
      .values({ id: 1, ...row, updated_at: now })
      .onConflict((oc) => oc.column('id').doUpdateSet({ ...row, updated_at: now }))
      .execute();
  }

  /**
   * True when the wizard has run and a row exists. Cheap precondition
   * check used by the daemon entrypoint to decide between operational
   * boot and NEEDS_SETUP mode.
   */
  async exists(): Promise<boolean> {
    const row = await this.db
      .selectFrom('secrets')
      .select('id')
      .where('id', '=', 1)
      .executeTakeFirst();
    return row !== undefined;
  }

  /**
   * #331: one-time upgrade step. If an existing install stored the
   * dashboard password in plaintext (pre-hashing), hash it in place.
   * Returns true when it hashed something. No-op once hashed, and when
   * there's no row. Runs at boot before auth is wired.
   */
  async ensurePasswordHashed(now: number = Date.now()): Promise<boolean> {
    const row = await this.db
      .selectFrom('secrets')
      .select('dashboard_password')
      .where('id', '=', 1)
      .executeTakeFirst();
    if (!row || isPasswordHashed(row.dashboard_password)) return false;
    await this.db
      .updateTable('secrets')
      .set({ dashboard_password: hashPassword(row.dashboard_password), updated_at: now })
      .where('id', '=', 1)
      .execute();
    return true;
  }

  /**
   * #331: one-time upgrade - encrypt any plaintext secret columns in
   * place under the current key. Idempotent (skips already-encrypted
   * values). Returns how many columns it encrypted. No-op without crypto.
   */
  async ensureEncrypted(now: number = Date.now()): Promise<number> {
    if (!this.crypto) return 0;
    const row = await this.db
      .selectFrom('secrets')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirst();
    if (!row) return 0;
    const patch: Record<string, string> = {};
    for (const f of SECRETS_ENCRYPTED_FIELDS) {
      const v = (row as Record<string, unknown>)[f];
      if (typeof v === 'string' && v.length > 0 && !this.crypto.isEncrypted(v)) {
        patch[f] = this.crypto.encrypt(f, v);
      }
    }
    const cols = Object.keys(patch);
    if (cols.length === 0) return 0;
    await this.db
      .updateTable('secrets')
      .set({ ...patch, updated_at: now })
      .where('id', '=', 1)
      .execute();
    return cols.length;
  }
}
