# Security policy

## Reporting a vulnerability

Hashrate Autopilot is a Bitcoin tool, so I take security reports
seriously. **Please don't post exploits, suspected vulnerabilities,
or anything that could enable an attack against another operator's
funds in public issues, public discussions, pull requests, or any
public channel.**

Use one of these instead:

- **GitHub's private vulnerability reporting feature.** From this
  repo's Security tab, click "Report a vulnerability." That opens a
  private channel between you and me with the same workflow as a
  normal issue but invisible to anyone else. Preferred.
- **Email**: `rdouma@cygno.com`. Encrypt if you'd like; I can share
  a PGP key on request.

I'll confirm I've read your report within a few days. If your report
is reproducible and I agree it's a real vulnerability, I'll work on a
fix and coordinate disclosure with you - typically a private patch,
followed by a public release with a credit if you want one.

This is a hobby project run by one person in their spare time. I try
to respond soon, but I'm not on it 24/7 and there's no service-level
agreement attached to any of this. If a report is critical and you
haven't heard back in a week, feel free to ping the email again or
ask in a (non-exploit) public issue whether I've seen anything.

## What's in scope

- The autopilot daemon itself (`packages/daemon/**`)
- The dashboard (`packages/dashboard/**`) and the auth flow
- The Umbrel community-store package (`rdouma-hashrate-autopilot/**`)
- The Docker image published to `ghcr.io/rdouma/hashrate-autopilot`
- The setup wizard's secret-handling paths

## What's out of scope

- Vulnerabilities in upstream dependencies that aren't reachable in
  any default code path - report those directly to the dependency.
- Misconfiguration of an operator's own environment (publicly
  exposing the dashboard without a reverse proxy, weak passwords on
  the wizard step, etc.). The default Umbrel install routes through
  `app_proxy` and is fine; deliberately bypassing that is on you.
- The Braiins Hashpower API itself, the Ocean pool, or any other
  third-party service the autopilot consumes - report those to their
  respective vendors.
- Forks of this repository. If a fork has a vulnerability, contact
  the fork's maintainer.

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

If you'd like a CVE assigned, GitHub's vulnerability advisories can
do that as part of the private flow. Otherwise we'll just publish a
patch and a CHANGELOG note.

Thank you for taking the time to report responsibly.
