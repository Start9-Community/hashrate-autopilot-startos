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
import type { Database } from '../types.js';

export class SecretsRepo {
  constructor(private readonly db: Kysely<Database>) {}

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
    // Drop columns that aren't part of SecretsSchema; pass the rest
    // through Zod so a row hand-edited to be invalid surfaces a clear
    // schema error rather than silently flowing into the daemon.
    const candidate: Record<string, string | undefined> = {
      braiins_owner_token: row.braiins_owner_token,
      dashboard_password: row.dashboard_password,
    };
    if (row.braiins_read_only_token) candidate['braiins_read_only_token'] = row.braiins_read_only_token;
    if (row.bitcoind_rpc_url) candidate['bitcoind_rpc_url'] = row.bitcoind_rpc_url;
    if (row.bitcoind_rpc_user) candidate['bitcoind_rpc_user'] = row.bitcoind_rpc_user;
    if (row.bitcoind_rpc_password) candidate['bitcoind_rpc_password'] = row.bitcoind_rpc_password;
    if (row.telegram_bot_token) candidate['telegram_bot_token'] = row.telegram_bot_token;
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
    const row = {
      braiins_owner_token: validated.braiins_owner_token,
      braiins_read_only_token: validated.braiins_read_only_token ?? null,
      dashboard_password: storedPassword,
      bitcoind_rpc_url: validated.bitcoind_rpc_url ?? null,
      bitcoind_rpc_user: validated.bitcoind_rpc_user ?? null,
      bitcoind_rpc_password: validated.bitcoind_rpc_password ?? null,
      telegram_bot_token: validated.telegram_bot_token ?? null,
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
}
