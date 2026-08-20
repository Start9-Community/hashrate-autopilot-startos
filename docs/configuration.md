# Configuration via environment variables

The daemon resolves configuration in priority order:

1. **Environment variables** - anything matching `BHA_*` (table below).
2. **SQLite database** (`data/state.db`) - written by the dashboard's
   Config page, by `pnpm setup`, or by the future first-run wizard
   (#57).
3. **Schema defaults** - see `packages/daemon/src/config/schema.ts`.

Env-var overrides are read **once at boot** and re-validated through
the same Zod schemas the dashboard uses, so a malformed value fails
loudly on startup rather than being silently ignored.

## Why this exists

Appliance environments (Umbrel, Start9, vanilla `docker run`) inject
configuration declaratively as environment variables. The
SOPS-encrypted file + interactive `setup.ts` flow stays for power
users; this layer makes "set these env vars and start the container"
a complete path.

## Naming convention

Every env-var is `BHA_<UPPER_SNAKE_CASE>` of the underlying schema
field. The `BHA_` prefix (historical, from early Braiins-only days) avoids collision
with the unrelated `BITCOIN_RPC_*` env vars Umbrel and Start9 inject
for bitcoind discovery - that integration is a separate concern, see
issue #60.

## Secrets

| Env var | Schema field | Notes |
|---|---|---|
| `BHA_BRAIINS_OWNER_TOKEN` | `braiins_owner_token` | Required. |
| `BHA_BRAIINS_READ_ONLY_TOKEN` | `braiins_read_only_token` | Optional. |
| `BHA_DASHBOARD_PASSWORD` | `dashboard_password` | Required. Basic Auth password for the dashboard. |
| `BHA_BITCOIND_RPC_URL` | `bitcoind_rpc_url` | Optional. Editable from the Config page. |
| `BHA_BITCOIND_RPC_USER` | `bitcoind_rpc_user` | Optional. |
| `BHA_BITCOIND_RPC_PASSWORD` | `bitcoind_rpc_password` | Optional. |
| `BHA_TELEGRAM_BOT_TOKEN` | `telegram_bot_token` | Active (#100). Dual-location: also a live-editable config field; the env var seeds both. |

### Secrets at rest and in the API (#331)

Secrets that live in the database are **AES-256-GCM encrypted at rest**
(Braiins owner + read-only tokens, `bitcoind_rpc_password`,
`telegram_bot_token`, `ddns_credential`), and the dashboard password is
stored as a one-way **scrypt** hash. The encryption key is resolved
`BHA_SECRET_KEY` env > `BHA_SECRET_KEY_FILE` > a generated `secret.key`
next to `state.db` (see the process-level table below). Legacy plaintext
rows are encrypted or hashed in place on the next daemon boot. If the key
is lost the daemon treats the affected secret as unset and asks you to
re-enter it, rather than crash-looping.

The config API is **write-only** for credential fields: `GET /api/config`
returns `telegram_bot_token`, `bitcoind_rpc_password`, and
`ddns_credential` blanked, and a blank value on save means "keep the
stored one". Non-secret fields (usernames, URLs) stay visible. The
config-change audit log redacts credential values as well (GHSA-x8x9).

Env-var and SOPS values still win over the database on every boot, so on
those installs the encrypted DB copy is effectively a seed, not the
source of truth.

### Rotating secrets in-app (#332)

On database-sourced installs (the appliance / Umbrel path, where there is
no shell or SOPS), Config -> Pool & Payout -> **Security & credentials**
lets you change the dashboard password (applied immediately) and rotate
the Braiins owner and read-only tokens (validated against Braiins before
saving; applied on the next daemon restart), each gated on your current
password. On env- or SOPS-sourced installs that section is read-only and
points you back to this file, since a database write would be overwritten
on the next boot. See [`credential-rotation.md`](credential-rotation.md).

## Targets and pricing

| Env var | Schema field | Type |
|---|---|---|
| `BHA_TARGET_HASHRATE_PH` | `target_hashrate_ph` | float, PH/s |
| `BHA_MINIMUM_FLOOR_HASHRATE_PH` | `minimum_floor_hashrate_ph` | float, PH/s |
| `BHA_MAX_BID_SAT_PER_EH_DAY` | `max_bid_sat_per_eh_day` | int, sat/EH/day |
| `BHA_MAX_OVERPAY_VS_HASHPRICE_SAT_PER_EH_DAY` | `max_overpay_vs_hashprice_sat_per_eh_day` | int (default 2,000,000 = cap on) or empty/0 (disable) |
| `BHA_OVERPAY_SAT_PER_EH_DAY` | `overpay_sat_per_eh_day` | int, sat/EH/day |
| `BHA_BID_BUDGET_SAT` | `bid_budget_sat` | int sat; `0` = use full wallet balance per CREATE |
| `BHA_BID_EDIT_DEADBAND_PCT` | `bid_edit_deadband_pct` | float (%); default 20 (legacy `overpay/5` equivalent). EDIT_PRICE noise floor: `max(tick_size, overpay × pct / 100)` (#222, migration 0099) |
| `BHA_MAX_ACCEPTABLE_FEE_PCT` | `max_acceptable_fee_pct` | float (%); default 0 (any non-zero fee halts mutations). Mutation gate denies CREATE / EDIT / EDIT_SPEED when any active bid's `fee_rate_pct` exceeds this ceiling; CANCEL remains allowed (#222, migration 0099) |

## Pool destination

| Env var | Schema field |
|---|---|
| `BHA_DESTINATION_POOL_URL` | `destination_pool_url` |
| `BHA_DESTINATION_POOL_WORKER_NAME` | `destination_pool_worker_name` |
| `BHA_BTC_PAYOUT_ADDRESS` | `btc_payout_address` |
| `BHA_OCEAN_CHAIN` | `ocean_chain` |

`ocean_chain` (#363, migrations 0122/0123): which Ocean sharelog the daemon follows since the 8/8/2026 chain split - `mainstream` (default; JSON API at `api.ocean.xyz`) or `bip110`. Ocean has confirmed (support, 2026-08-18) that **no API exists for the BIP110 chain, none is planned, and scraping the site is not supported** - so on `bip110` the daemon stops polling Ocean entirely: the Ocean panel explains why no hashrate/share-log/earnings can be shown, the P&L panel is marked incomplete (unpaid earnings unreadable), and the hashprice-based dynamic price cap is bypassed since its reference can never arrive (the fixed `max_bid` remains the only ceiling; the #28 refuse-to-trade rule would otherwise halt bidding forever). Each tick's Ocean reading is stamped with its chain so the deduced-payouts scanner never reads a cross-chain balance jump as a payout. Takes effect within one 60 s cache TTL - no restart needed.

On `bip110`, P&L **collected** is derived purely from on-chain payouts at the payout address (#366): the sum of non-reorged `reward_events`, the same address-history ledger (walked via the operator's own node, which follows their chain) that drives the chart's lifetime-earnings line - because the `earnpay` payout ledger that normally feeds collected can never sync there. Lightning payouts are untrackable on that chain (no ledger to read, no unpaid-earnings feed to deduce them from) and are reported as unknown, the net line is `collected + manual offset − spent` without the structurally-unavailable unpaid term, and the P&L *rebuild* / *hard reset* buttons re-run the on-chain address-history backfill instead of the earnpay fetch. A balance-check backend is required for earnings to show at all (Electrum recommended - the bitcoind-only `scantxoutset` path sees only currently-unspent outputs, so swept payouts drop out of collected); without one the panel reports collected as not configured rather than a misleading 0.

## Boot + run mode

| Env var | Schema field | Allowed values |
|---|---|---|
| `BHA_BOOT_MODE` | `boot_mode` | `ALWAYS_DRY_RUN` (default), `LAST_MODE`, `ALWAYS_LIVE` |
| `BHA_SPENT_SCOPE` | `spent_scope` | `autopilot`, `account` (default) |
| `BHA_BTC_PRICE_SOURCE` | `btc_price_source` | `coingecko` (default), `none`, `coinbase`, `bitstamp`, `kraken` |
| `BHA_PAYOUT_SOURCE` | `payout_source` | `none` (default), `electrs`, `bitcoind` |

## Cheap-mode (opportunistic scaling)

| Env var | Schema field |
|---|---|
| `BHA_CHEAP_TARGET_HASHRATE_PH` | `cheap_target_hashrate_ph` |
| `BHA_CHEAP_THRESHOLD_PCT` | `cheap_threshold_pct` |
| `BHA_CHEAP_SUSTAINED_WINDOW_MINUTES` | `cheap_sustained_window_minutes` |

## Alert thresholds

| Env var | Schema field |
|---|---|
| `BHA_WALLET_RUNWAY_ALERT_DAYS` | `wallet_runway_alert_days` (fractional days allowed, e.g. 0.5; 0 disables) |
| `BHA_BELOW_FLOOR_ALERT_AFTER_MINUTES` | `below_floor_alert_after_minutes` |
| `BHA_ZERO_HASHRATE_LOUD_ALERT_AFTER_MINUTES` | `zero_hashrate_loud_alert_after_minutes` |
| `BHA_POOL_OUTAGE_BLIP_TOLERANCE_SECONDS` | `pool_outage_blip_tolerance_seconds` |
| `BHA_API_OUTAGE_ALERT_AFTER_MINUTES` | `api_outage_alert_after_minutes` |
| `BHA_DATUM_UNREACHABLE_ALERT_AFTER_MINUTES` | `datum_unreachable_alert_after_minutes` |
| `BHA_SUSTAINED_PAUSED_ALERT_AFTER_MINUTES` | `sustained_paused_alert_after_minutes` |
| `BHA_MARKETPLACE_EMPTY_ALERT_AFTER_MINUTES` | `marketplace_empty_alert_after_minutes` |

## Retention

| Env var | Schema field |
|---|---|
| `BHA_TICK_METRICS_RETENTION_DAYS` | `tick_metrics_retention_days` |
| `BHA_DECISIONS_UNEVENTFUL_RETENTION_DAYS` | `decisions_uneventful_retention_days` |
| `BHA_DECISIONS_EVENTFUL_RETENTION_DAYS` | `decisions_eventful_retention_days` |
| `BHA_ALERTS_RETENTION_DAYS` | `alerts_retention_days` |
| `BHA_CHART_MAX_MARKERS` | `chart_max_markers` |

## Optional integrations

| Env var | Schema field | Notes |
|---|---|---|
| `BHA_DATUM_API_URL` | `datum_api_url` | Empty string disables. |
| `BHA_ELECTRS_HOST` | `electrs_host` | Empty string disables. Any Electrum-protocol server works: electrs, Fulcrum, ElectrumX. |
| `BHA_ELECTRS_PORT` | `electrs_port` | Empty string disables. |
| `BHA_BITCOIND_RPC_URL` | `bitcoind_rpc_url` | Also accepted in secrets; either works. |
| `BHA_BITCOIND_RPC_USER` | `bitcoind_rpc_user` | |
| `BHA_BITCOIND_RPC_PASSWORD` | `bitcoind_rpc_password` | |

## Notifications

| Env var | Schema field | Type |
|---|---|---|
| `BHA_TELEGRAM_BOT_TOKEN` | `telegram_bot_token` | string (editable config field, but write-only in the API and encrypted at rest - see [Secrets at rest](#secrets-at-rest-and-in-the-api-331); the env var also seeds the secrets-tier fallback) |
| `BHA_TELEGRAM_CHAT_ID` | `telegram_chat_id` | string |
| `BHA_TELEGRAM_INSTANCE_LABEL` | `telegram_instance_label` | string |
| `BHA_NOTIFICATIONS_MUTED` | `notifications_muted` | boolean |
| `BHA_NOTIFICATION_RETRY_INTERVAL_MINUTES` | `notification_retry_interval_minutes` | int |
| `BHA_NOTIFICATION_DISABLED_EVENT_CLASSES` | `notification_disabled_event_classes` | comma-separated list |
| `BHA_NOTIFY_ON_POOL_BLOCK_CREDIT` | `notify_on_pool_block_credit` | boolean |
| `BHA_NOTIFY_ON_BRAIINS_DEPOSIT` | `notify_on_braiins_deposit` | boolean |
| `BHA_NOTIFY_ON_PAYOUT_INITIATED` | `notify_on_payout_initiated` | boolean (#226, migration 0101) |
| `BHA_NOTIFY_ON_PAYOUT_CONFIRMED` | `notify_on_payout_confirmed` | boolean (#226, migration 0101) |
| `BHA_NOTIFICATION_LOCALE` | `notification_locale` | `en`, `nl`, `es` |

## DDNS

| Env var | Schema field |
|---|---|
| `BHA_DDNS_PROVIDER` | `ddns_provider` |
| `BHA_DDNS_HOSTNAME` | `ddns_hostname` |
| `BHA_DDNS_USERNAME` | `ddns_username` |
| `BHA_DDNS_CREDENTIAL` | `ddns_credential` |
| `BHA_DDNS_UPDATE_URL` | `ddns_update_url` |

## Solo-mining monitoring

| Env var | Schema field | Type |
|---|---|---|
| `BHA_SOLO_MINING_ENABLED` | `solo_mining_enabled` | boolean |
| `BHA_SOLO_OVERHEATING_THRESHOLD_CELSIUS` | `solo_overheating_threshold_celsius` | int (°C; 0 = built-in flat 75 °C ceiling) |
| `BHA_SOLO_ZERO_HASHRATE_ALERT_AFTER_MINUTES` | `solo_zero_hashrate_alert_after_minutes` | int |
| `BHA_SOLO_SHARE_REJECTION_THRESHOLD_PCT` | `solo_share_rejection_threshold_pct` | number (%) |
| `BHA_SOLO_SHARE_REJECTION_WINDOW_MINUTES` | `solo_share_rejection_window_minutes` | int |

## Payout history

| Env var | Schema field | Type |
|---|---|---|
| `BHA_INCLUDE_HISTORICAL_PAYOUTS` | `include_historical_payouts` | boolean |
| `BHA_HISTORICAL_PAYOUTS_OFFSET_SAT` | `historical_payouts_offset_sat` | int (sat) |

## UI / display

| Env var | Schema field | Type |
|---|---|---|
| `BHA_BLOCK_EXPLORER_URL_TEMPLATE` | `block_explorer_url_template` | string with `{hash}` or `{height}` |
| `BHA_BLOCK_EXPLORER_TX_URL_TEMPLATE` | `block_explorer_tx_url_template` | string with `{txid}` or `{hash}` |
| `BHA_BRAIINS_HASHRATE_SMOOTHING_MINUTES` | `braiins_hashrate_smoothing_minutes` | int ≥ 1 |
| `BHA_DATUM_HASHRATE_SMOOTHING_MINUTES` | `datum_hashrate_smoothing_minutes` | int ≥ 1 |
| `BHA_BRAIINS_PRICE_SMOOTHING_MINUTES` | `braiins_price_smoothing_minutes` | int ≥ 1 |
| `BHA_SHOW_EFFECTIVE_RATE_ON_PRICE_CHART` | `show_effective_rate_on_price_chart` | boolean |
| `BHA_SHOW_SHARE_LOG_ON_HASHRATE_CHART` | `show_share_log_on_hashrate_chart` | boolean |
| `BHA_BLOCK_FOUND_SOUND` | `block_found_sound` | `off`, `cartoon-cowbell`, `glass-drop-and-roll`, `metallic-clank-1`, `metallic-clank-2`, `ocean-mining-found-block`, `custom` |
| `BHA_DISPLAY_NUMBER_LOCALE` | `display_number_locale` | `system` (default), `en-US`, `nl-NL`, `fr-FR`, `no-grouping` (#227 follow-up, migration 0102) |
| `BHA_DISPLAY_DATE_LAYOUT` | `display_date_layout` | `system` (default), `us`, `eu-spaced-24h`, `slash-dmy-24h`, `iso`, `slash-mdy-12h` (#227 follow-up, migration 0102) |
| `BHA_CHART_COLOR_OVERRIDES` | `chart_color_overrides` | JSON object keyed by series/marker name with `#RRGGBB` values, default `{}`. Covers 26 named slots (11 line series + 7 marker icons + 8 event glyphs incl. the #287 lifecycle trio and the #316 alert-condition band slot); see `docs/spec.md` §8. (#238 + v1.12 marker keys, migration 0103) |
| `BHA_DASHBOARD_TILES` | `dashboard_tiles` | JSON array of tile-catalogue ids (#266, migration 0110); empty = default six |
| `BHA_DASHBOARD_CARD_ORDER` | `dashboard_card_order` | JSON array (reserved/dormant - card order lives in browser localStorage; migration 0108) |
| `BHA_DEBUG_API_ENABLED` | `debug_api_enabled` | boolean |

## Process-level env vars (not config overrides)

These are read directly by the daemon entrypoint and have no `BHA_`
prefix - they predate the override layer:

| Env var | Default | Purpose |
|---|---|---|
| `HTTP_HOST` | `0.0.0.0` | Bind address for the HTTP server. |
| `HTTP_PORT` | `3010` | Bind port. |
| `TICK_INTERVAL_MS` | `60000` | Controller tick cadence. |
| `DASHBOARD_STATIC` | `packages/dashboard/dist` | Path to built dashboard assets. |
| `SECRETS_PATH` | `<repo>/.env.sops.yaml` | Override the SOPS file location. |
| `DB_PATH` | `<repo>/data/state.db` | Override the SQLite path. |
| `SOPS_AGE_KEY_FILE` | `~/.config/hashrate-autopilot/age.key` | Age private key for SOPS decrypt. |
| `BHA_SECRET_KEY` | (unset) | Master key for encrypting database-stored secrets at rest (#331). On Umbrel this is set to the device-derived `APP_SEED`. When unset, the daemon falls back to `BHA_SECRET_KEY_FILE`, then to a generated `secret.key` (mode 0600) next to `state.db`. |
| `BHA_SECRET_KEY_FILE` | (unset) | Path to a file holding the at-rest encryption key, used when `BHA_SECRET_KEY` is not set. |
