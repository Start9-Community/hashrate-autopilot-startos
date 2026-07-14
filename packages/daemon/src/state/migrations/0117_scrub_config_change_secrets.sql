-- Security (GHSA-x8x9): v1.16.0's config-change audit logging wrote raw
-- old/new values for every changed config field into system_events,
-- including credentials. Those rows are exposed via GET /api/system-events,
-- the Timeline UI, and the Excel export. Scrub the credential values out
-- of any rows v1.16.0 already persisted so upgrading removes the leak from
-- existing installs. Going forward the daemon redacts these at write time
-- (see packages/shared/src/config-sensitive.ts - keep the field list in
-- sync).
UPDATE system_events
SET old_value = '[redacted]', new_value = '[redacted]'
WHERE kind = 'config_change'
  AND field IN (
    'telegram_bot_token',
    'bitcoind_rpc_user',
    'bitcoind_rpc_password',
    'ddns_username',
    'ddns_credential'
  );
