# In-app credential rotation - design

Status: **implemented** (build 771). Related: #331 (secrets at rest), GHSA-wvpp.

## Why

The config-table secrets (Telegram token, bitcoind RPC password, DDNS credential) are already changeable in Config. But three secrets are **wizard-only** today - once set, there's no in-app way to change them:

- dashboard password
- Braiins owner token
- Braiins read-only token

On a bare / SOPS install you rotate these via env vars or `scripts/sops-edit.sh`. **On Umbrel you can do neither** - no shell, no SOPS. So an Umbrel operator who needs to cycle a leaked token, or who changed their Braiins account, is stuck re-running setup. This adds an in-app rotation flow.

## Decisions (interview)

1. **Scope:** rotate the dashboard password + Braiins owner token + read-only token from the UI. For installs whose secrets come from env/SOPS (not the DB), show a read-only "managed by your environment / SOPS - change them there" state instead of editors, so the panel is coherent everywhere and never silently no-ops.
2. **Friction:** every change requires re-entering the **current dashboard password**. Basic Auth means the browser already caches the password, so this is what protects a walked-away unlocked browser from locking you out or swapping your owner token.
3. **Validation:** a new Braiins token is **test-called against Braiins before it's committed**; a typo / wrong token is rejected with a clear error so you can't silently brick bidding. (Owner token: an owner-scoped call; read-only token: a read call.)
4. **Apply immediately, no restart:** the new password works on the next request and the old one stops instantly (which also boots anyone still using it); the daemon hot-swaps to the new Braiins token without a restart.

## Backend

New auth-gated routes (all under the existing Basic Auth):

- `GET /api/security/state` -> `{ secret_source: 'env' | 'sops' | 'db', editable: boolean }`. `editable` is true only when `secret_source === 'db'`; the UI uses it to show editors vs the "managed externally" notice.
- `POST /api/security/password` `{ current_password, new_password }` -> verify current via `verifyPassword`; on mismatch 401. Hash the new one, write it (encrypted-at-rest path already handles the secrets row), then **hot-update the live auth verifier and clear the auth cache** so the old password dies immediately.
- `POST /api/security/braiins-token` `{ kind: 'owner' | 'read_only', current_password, token }` -> verify current password; **validate the token against Braiins**; on success write it (encrypted) and **hot-swap the running Braiins client's token**. On validation failure, 422 with the Braiins error, nothing written.

All three refuse with a clear error when `secret_source !== 'db'` (env/SOPS wins on next boot, so editing the DB would be a silent no-op).

### Hot-reload mechanics (the load-bearing part)

- **Password:** the Basic Auth `validate` closure reads `deps.password` today. Move that behind a small mutable holder (`{ value }`) so the route can update it in place; clear the `authCache` Map on change. Old password -> 401 on the next request automatically (Basic Auth resends every request).
- **Braiins token:** the Braiins client is built once at boot with the token. Give it a `setOwnerToken(...)` / `setReadOnlyToken(...)` (or read from a live ref) so the route can swap the credential without reconstructing the world. This is the main implementation risk and needs its own test.

## Frontend

New **Security** section in Config (add it to `TAB_SECTIONS` / `customSectionMeta` / the search index per the config-search convention):

- **Change password:** current password, new password, confirm. Client-side confirm match; server verifies current.
- **Rotate Braiins owner token:** current password + new token. Shows a spinner while it validates against Braiins; success/failure inline.
- **Rotate read-only token:** same shape.
- When `editable` is false: render each as a read-only row - "Managed by your environment / SOPS. Change it there and restart." No inputs.

All new strings translated en/nl/es.

## Out of scope

- bitcoind RPC creds, Telegram token, DDNS credential - already editable in Config.
- Multi-user / RBAC - this stays a single-operator appliance.
- Rotating the at-rest encryption key (`BHA_SECRET_KEY`) - separate concern; re-entering secrets re-encrypts them under the current key anyway.
