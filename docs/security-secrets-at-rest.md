# Secrets at rest - design & threat model

Status: **implemented** on `develop` (#331). Phases: (1A) dashboard password hashed, (1B) credentials write-only in the API, (2) field encryption + layered key resolution. Migrations are boot-time TS steps (they need the key), not SQL.
Context: security advisory GHSA-wvpp-w528-9p8x ("Sensitive credentials are stored in plaintext in the app SQLite database"). Related: GHSA-x8x9-3m72-9w8w (config-change audit log leaked credentials - already fixed, migration 0117).

## 1. What secrets exist, and where they live today

| Secret | Stored in | Recoverable needed at runtime? | Returned by API today? |
|---|---|---|---|
| Braiins owner token | `secrets` table | yes (mutations) | no |
| Braiins read-only token | `secrets` table | yes (polling) | no |
| Dashboard password | `secrets` table | **no** - only ever compared | no |
| bitcoind RPC url/user/password | `secrets` table AND `config` table | yes | **yes** (`GET /api/config`) |
| Telegram bot token | `secrets` table AND `config` table | yes | **yes** (`GET /api/config`) |
| DDNS username/credential | `config` table | yes | **yes** (`GET /api/config`) |

All of these are plaintext in `state.db` today. Anyone who obtains the DB file (or an app-data backup) reads them with one `SELECT`. That is the advisory's PoC.

Secrets can also arrive from outside the DB - the daemon already resolves them in priority order **env > SOPS file > DB** (`loadSecretsAnySource`). When env or SOPS provides them, the DB tier may be empty; this design only changes the DB tier.

## 2. The hard ceiling (read this first)

An unattended daemon must decrypt its own secrets on boot with no human present. Therefore the key must live somewhere the machine reaches by itself - and anything the machine reaches by itself, an attacker who controls the running machine also reaches. **No design here protects against full compromise of the live host.** What encryption at rest *does* protect is the data-without-the-key cases: a copied `state.db`, a shared/exported DB, an app-data backup, a support bundle. Those are real and common (the advisory's PoC is exactly this), so it's worth doing - with honest expectations.

The one exception to the ceiling: the **dashboard password**. It never needs to be recovered, only verified, so it gets hashed - and then even full host compromise does not reveal the password itself (which matters because people reuse passwords).

## 3. Design

Three independent measures, in order of certainty:

### 3.1 Hash the dashboard password (unconditional win)

- Replace the stored plaintext with an **scrypt** hash (Node built-in `crypto.scrypt`; N=2^15, r=8, p=1, 32-byte salt). Argon2id would be marginally better but needs a native dependency; scrypt is fine at this threat level and dependency-free.
- Basic-auth verification compares against the hash. Because the dashboard sends the password on every request, the verifier result is cached in memory (keyed by a SHA-256 of the presented credential) so scrypt cost is paid once per process per credential, not per request.
- Migration: on first boot after upgrade, hash the existing plaintext and overwrite it. One-way, no operator action.

### 3.2 Encrypt recoverable secrets in the DB (the main event)

- **Cipher:** AES-256-GCM (Node built-in), random 12-byte IV per value, the field name as AAD (so a ciphertext can't be swapped between columns).
- **Stored format:** `enc:v1:<base64 iv>:<base64 ciphertext+tag>`. The prefix makes encrypted vs legacy-plaintext values distinguishable, which makes the migration idempotent and the code able to read both during transition.
- **Key derivation:** the raw key material (any string) goes through HKDF-SHA256 with a fixed app-specific info string to produce the 32-byte AES key. Operators can therefore use any passphrase-like value as key material.
- **Scope:** every recoverable secret in §1's table, in both the `secrets` and `config` tables.
- **Migration:** on first boot with a key available, encrypt-in-place every plaintext secret value. Rows already `enc:v1:` are skipped.

### 3.3 Make credential fields write-only in the API

`GET /api/config` today returns raw Telegram token / RPC password / DDNS credential to any authenticated dashboard session. After this change it returns `""` for credential fields plus a `credential_set` marker so the UI can show "configured". `PUT /api/config` with an empty credential field means "keep the existing value". This closes the browser-side exposure regardless of what happens at rest.

### 3.4 Where the key comes from (layered, Docker-general)

Resolution order, mirroring the existing secret-source pattern:

1. **`BHA_SECRET_KEY` environment variable.** The portable, preferred source. The daemon has no idea who set it:
   - **Umbrel:** our `docker-compose.yml` sets `BHA_SECRET_KEY: ${APP_SEED}`. `APP_SEED` is a per-app secret Umbrel derives from the device's master seed - stable across restarts and stored *outside* the app's data directory, so app-data backups don't contain it. Zero user action.
   - **Generic Docker:** operator sets it via compose/`-e`/Docker secret file (`BHA_SECRET_KEY_FILE` also supported for `/run/secrets/...`).
   - **Bare metal:** systemd `EnvironmentFile=` pointing at a root-owned file outside the data directory, or a plain exported var.
2. **Generated key file** (`<data-dir>/secret.key`, mode 0600, 32 random bytes) - the zero-config fallback when no env key is set. Created on first boot, reused after.

### 3.5 Failure behavior (key lost / changed)

If stored values are `enc:v1:` but the current key fails to decrypt them (GCM authentication fails), the daemon does **not** crash-loop. It logs loudly, treats those secrets as unset, and surfaces the normal "credential missing" paths (wizard for the owner token, Config for the rest). The operator re-enters the secrets and they re-encrypt under the current key. Key rotation, if ever needed, is: set the new key, re-enter secrets (a `BHA_SECRET_KEY_OLD` re-encrypt path is possible later; not in scope now).

## 4. What this protects against - and what it does not

| Scenario | Before | After |
|---|---|---|
| Someone reads `state.db` (shared for support, found in a backup blob, SELECT on a copied file) | all secrets plaintext | **protected** - ciphertext without the key; dashboard password is a hash |
| App-data directory backup leaks (Umbrel `app-data/`, Docker volume) | all secrets plaintext | **protected on Umbrel / env-key setups** (key isn't in app-data); **not protected on keyfile fallback** (key file sits next to the DB - defeats DB-only leaks, not folder leaks) |
| Authenticated dashboard user reads credentials via API | Telegram/RPC/DDNS creds returned raw | **protected** - write-only fields |
| Password reuse exposure (attacker learns your dashboard password and tries it elsewhere) | plaintext recoverable | **protected** - scrypt hash, password itself never recoverable |
| Full compromise of the running host (root shell, malicious container escape) | everything readable | **not protected** - the daemon can decrypt, so root can too. Ceiling of §2 |
| Full-device backup including Umbrel's master seed | everything | **not protected** - the seed derives `APP_SEED`. Same ceiling |
| Memory scraping of the running process | secrets in RAM | **not protected** - inherent to an unattended daemon |

## 5. Per-installation matrix

| | Key source | DB-file leak | App-data/volume backup leak | User action needed |
|---|---|---|---|---|
| **Umbrel** | `${APP_SEED}` via compose (automatic) | safe | safe (key outside app-data) | none |
| **Docker, operator-managed key** | `BHA_SECRET_KEY` env / Docker secret | safe | safe if key not in the volume | set one env var |
| **Docker/bare metal, no key set** | generated `secret.key` in data dir | safe | **not safe** (key travels with folder) | none (honest fallback) |
| **Bare metal, env key** | `EnvironmentFile` outside data dir | safe | safe | create key file + unit line |
| **SOPS/age users** (existing path) | age key on disk; SOPS file encrypted | secrets-table tier may be empty (env/SOPS wins); config-table creds still benefit from §3.2 | age key location is the same question one level up | already configured |

## 6. How this compares to SOPS (which we already support)

SOPS/age and this design solve the same problem at different layers and they compose rather than compete:

- **SOPS** encrypts the *secrets file* (`.env.sops.yaml`) at rest; the daemon decrypts it at boot with an age key. Strengths: mature tooling, key can live anywhere (including hardware tokens), git-friendly. Weaknesses for this project: manual setup (unsuitable as an appliance default - Umbrel users will never run `sops`), and it only covers the secrets *file* tier - the DB-stored credentials (everything the wizard/Config writes) stay plaintext today, which is exactly what the advisory is about.
- **This design** covers the DB tier that SOPS can't reach, with zero setup on Umbrel and one env var elsewhere. It is deliberately less flexible than SOPS about key management (no hardware tokens, no multi-recipient).
- **Recommendation per profile:** Umbrel/appliance users get §3 automatically and never learn any of these words. Power users who already run SOPS keep it (env > SOPS priority is unchanged) and additionally get their DB tier encrypted. Nobody loses an option.

## 7. Explicitly out of scope

- SQLCipher / full-database encryption: heavier dependency, same key-availability ceiling, and most of `state.db` (tick metrics, pool blocks) is not sensitive. Field-level encryption of the actual secrets is proportionate.
- Hardware-backed keys (TPM): not exposed to Umbrel app containers; bare-metal users who want this can put `BHA_SECRET_KEY` behind their own TPM tooling.
- Protecting against a compromised running host (§2 ceiling).

## 8. Implementation order

1. §3.1 password hash + §3.3 write-only API (independent, low-risk, immediately valuable).
2. §3.4 key resolution + §3.2 field encryption + migration.
3. Umbrel compose line `BHA_SECRET_KEY: ${APP_SEED}` + docs (README security section, setup guides).
4. Publish GHSA-wvpp with the release that carries all of it.
