# Security policy

## Reporting a vulnerability

Hashrate Autopilot for StartOS is a Bitcoin tool, so security reports
need careful handling. **Please don't post exploits, suspected
vulnerabilities, or anything that could enable an attack against
another operator's funds in public issues, public discussions, pull
requests, or any public channel.**

Use one of these instead:

- **GitHub's private vulnerability reporting feature.** From this
  repo's Security tab, click "Report a vulnerability." That opens a
  private channel with the same workflow as a normal issue but
  invisible to anyone else. Preferred.

Confirmed vulnerabilities are handled through a private patch followed
by a public release and changelog note. Credit is included when the
reporter wants it.

There is no service-level agreement. If a critical report does not get
a response after a reasonable interval, open a non-exploit public
issue asking whether the private report was received.

## What's in scope

- The StartOS package wrapper, manifest, dependencies, backup hooks,
  and install instructions.
- The daemon and dashboard code in this repository when used by the
  StartOS package.
- The setup wizard and secret-handling paths in this repository.
- Documentation in this fork that could lead operators to unsafe
  configuration.

## What's out of scope

- Vulnerabilities in upstream dependencies that aren't reachable in
  any default code path - report those directly to the dependency.
- The upstream Docker image, upstream Umbrel community-store package,
  or upstream release process unless the issue is caused by this fork's
  downstream changes.
- Misconfiguration of an operator's own environment (publicly
  exposing the dashboard without a reverse proxy, weak passwords on
  the wizard step, etc.). The default Umbrel install routes through
  `app_proxy` and is fine; deliberately bypassing that is on you.
- The Braiins Hashpower API itself, the Ocean pool, or any other
  third-party service the autopilot consumes - report those to their
  respective vendors.
- Forks derived from this repository. If a separate fork has a
  vulnerability, contact that fork's maintainer.

## How secrets are protected

Your credentials (Braiins tokens, bitcoind RPC password, Telegram bot
token, DDNS credential) are AES-256-GCM encrypted at rest in the
database, and the dashboard password is stored as a one-way scrypt hash.
The encryption key comes from `BHA_SECRET_KEY` (on Umbrel that's the
device-derived `APP_SEED`, which lives outside the app's data folder) or
a generated key file next to the database. The config API is write-only
for credential fields, and the config-change audit log redacts them.

This protects the **data-at-rest** cases: a copied database, an
unencrypted backup, an exported support bundle. It does **not** protect
against someone who already controls the running machine - an unattended
daemon has to decrypt its own secrets on boot with no human present, so
the key is necessarily reachable by privileged processes on that host.
Env- and SOPS-sourced secrets are never written to disk in the clear;
DB-sourced secrets are the encrypted-at-rest path above. Full detail:
[`docs/security-secrets-at-rest.md`](docs/security-secrets-at-rest.md).

## Past advisories

- **GHSA-wvpp-w528-9p8x** (high): credentials were stored in plaintext in
  the SQLite database, so a copied database or backup exposed them.
  Addressed in v1.17.0 by encrypting DB-stored secrets at rest and
  hashing the dashboard password; existing installs upgrade in place on
  the first start of that version.
- **GHSA-x8x9-3m72-9w8w** (medium): the config-change audit log wrote
  credential values in cleartext into Timeline system events, which were
  readable via the API, the UI, and the Excel export. Addressed in
  v1.17.0 by redacting credential fields at write time and scrubbing the
  previously-logged rows on upgrade.

Both were reported privately and are credited to their reporters in the
published advisories.

## Coordinated disclosure

If you'd like a CVE assigned, GitHub's vulnerability advisories can do
that as part of the private flow. Otherwise the fix ships as a patch
with a changelog note.
