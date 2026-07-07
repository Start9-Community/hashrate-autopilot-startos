/**
 * Config fields that hold a credential or secret and must never be
 * written verbatim into the config-change audit log (`system_events`).
 *
 * v1.16.0's config-change logging recorded raw old/new values for every
 * changed field, so saving one of these persisted the plaintext secret
 * into the DB and exposed it via `GET /api/system-events`, the Timeline,
 * and the Excel export. The daemon now substitutes `CONFIG_VALUE_REDACTED`
 * for these fields at write time (the change is still logged, just
 * without the value), and a migration scrubs the values already stored
 * by v1.16.0. Keep this set in sync with the field list in the scrub
 * migration.
 *
 * URLs, addresses, hostnames and chat ids are intentionally NOT here:
 * they are not login credentials, and seeing them change is useful audit
 * signal (a changed payout address is exactly the kind of edit you want
 * visible).
 */
export const SENSITIVE_CONFIG_FIELDS: ReadonlySet<string> = new Set([
  'telegram_bot_token',
  'bitcoind_rpc_user',
  'bitcoind_rpc_password',
  'ddns_username',
  'ddns_credential',
]);

/** Placeholder stored in place of a sensitive field's value in the audit log. */
export const CONFIG_VALUE_REDACTED = '[redacted]';

export function isSensitiveConfigField(field: string): boolean {
  return SENSITIVE_CONFIG_FIELDS.has(field);
}
