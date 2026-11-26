<p align="center">
  <img src="icon.png" alt="Hashrate Autopilot logo" width="21%" />
</p>

# Hashrate Autopilot on StartOS

> Everything not listed in this document should behave the same as upstream
> Hashrate Autopilot. If a feature, setting, or behavior is not mentioned here,
> the upstream documentation is accurate and fully applicable — see the
> Documentation section of `instructions.md` for links.

[Hashrate Autopilot](https://github.com/rdouma/hashrate-autopilot) keeps a bid alive on the Braiins Hashpower marketplace within limits the operator sets, and routes the rented hashrate to their own mining setup. It is an application that spends real money on a schedule, so the two facts that matter most about this package are that it starts in DRY-RUN and that its run mode does not retract a bid already placed.

- **Upstream repo:** <https://github.com/rdouma/hashrate-autopilot>
- **Wrapper repo:** <https://github.com/Start9-Community/hashrate-autopilot-startos>

## StartOS package updates

### 1.18.4:2 — Bitcoin Roots and Bitcoin Knots compatibility

This revision adds **Bitcoin Roots** to the existing **Bitcoin Core** and **Bitcoin Knots (pre-RDTS)** choices. Install one compatible node. All three provide the StartOS `bitcoind` service, and Autopilot uses its RPC connection for block headers and payout lookups.

| Bitcoin implementation | Supported StartOS package versions |
| --- | --- |
| Core | 28.x from `28.4:42`, 29.x from `29.5:4`, 30.x from `30.4:4`, or `31.2:4` and later |
| Roots | `#roots:29.4:1` and later |
| Knots (pre-RDTS) | `#knotsprerdts:29.3:33` and later |

The minimum revisions above expose the RPC cookie on the shared `public` volume. Electrs and DATUM Gateway also check their own Bitcoin requirements. [Bitcoin Roots package](https://github.com/Start9-Community/bitcoin-roots-startos) · [Bitcoin Knots package](https://github.com/Start9-Community/bitcoin-knots-prerdts-startos)

### 1.18.4:1 — DATUM Gateway stats API fallback

Upstream Hashrate Autopilot 1.18.4 reads worker count and hashrate from the optional
`/umbrel-api` JSON endpoint. StartOS DATUM Gateway `0.5.1-beta:3` serves those figures
on its regular status page at `/` and returns HTTP 404 for the JSON endpoint. This made
**Test connection** report a failure on a reachable gateway and left the DATUM panel
without readings. [Upstream poller at v1.18.4](https://github.com/rdouma/hashrate-autopilot/blob/v1.18.4/packages/daemon/src/services/datum.ts)

Starting with package **1.18.4:1**, Autopilot tries JSON first. Only a 404 triggers a
read of the status page at the same base URL. It reads **Total Work Subscriptions**
(or **Total Connections** when subscriptions are unavailable) and **Estimated Hashrate**,
converting the rate to PH/s. Missing readings stay unknown; a page with neither reading
fails the check. The connection test and background poller share this behavior.
Keep the StartOS-provided DATUM base URL in the dashboard. This change affects monitoring only.

The [package patch](patches/datum.patch) adapts the historical StartOS fallback and is included in `1.18.4:2`. For the dashboard field syntax, see [DATUM and Electrs monitoring settings](#datum-and-electrs-monitoring-settings).
See the [update procedure](UPDATING.md#retiring-the-datum-patch) for when to remove it.

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [File Models](#file-models)
- [Dependencies](#dependencies)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
  - [DATUM and Electrs monitoring settings](#datum-and-electrs-monitoring-settings)
- [Actions](#actions)
- [Tasks](#tasks)
- [Health Checks](#health-checks)
- [Backups and Restore](#backups-and-restore)
- [Limitations and Differences](#limitations-and-differences)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

One image built from upstream's published release runs in one subcontainer.

| Property     | Value                                    |
| ------------ | ---------------------------------------- |
| Image        | `ghcr.io/rdouma/hashrate-autopilot`      |
| Architecture | x86_64, aarch64                          |
| Command      | `node packages/daemon/dist/main.js`      |
| Workdir      | `/app`                                   |

| Subcontainer             | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `hashrate-autopilot-sub` | The `primary` daemon — the one to `attach` to |

The Dockerfile starts from upstream's published multi-architecture image, pinned by digest. It adds the DATUM statistics fallback described above. The upstream image supplies Node 22.23.5 and its default TLS trust store.

## Volume and Data Layout

One volume, holding a single SQLite database that is the entire state of the service.

| Volume | Mount Point | Purpose                                    |
| ------ | ----------- | ------------------------------------------ |
| `main` | `/app/data` | `state.db` — configuration, secrets, history |

| Path                | Written by | Holds                                                                   |
| ------------------- | ---------- | ----------------------------------------------------------------------- |
| `/app/data/state.db` | The daemon | Operator configuration, encrypted application secrets, runtime state, decision and payout history |

Everything else in the container belongs to the image and is replaced on update. Bitcoin's `public` volume is also mounted, read-only, at `/mnt/bitcoin` — see [Dependencies](#dependencies).

The secrets in that database — the Braiins access token, the dashboard password, Telegram credentials — are encrypted at rest by the application, not by this package. Uninstalling deletes the volume and everything above with it.

## File Models

None. This package writes no configuration file and keeps no `store.json`: everything it has to tell the application is passed as environment on each start, and everything the operator sets lives in the application's own database.

The environment falls into three groups. The first is fixed runtime plumbing:

| Variable            | Value                                          |
| ------------------- | ---------------------------------------------- |
| `NODE_ENV`          | `production`                                   |
| `HTTP_HOST`         | `0.0.0.0`                                      |
| `HTTP_PORT`         | The internal service port                      |
| `DB_PATH`           | `/app/data/state.db`                           |
| `DASHBOARD_STATIC`  | The packaged dashboard assets                  |
| `APP_VERSION`       | The packaged upstream version, shown in the UI |

The second is resolved from the dependencies on every start, through `sdk.host.getBridgeAddress`, so no bridge port is ever assumed or written down:

| Variable                  | Resolved from                                            |
| ------------------------- | -------------------------------------------------------- |
| `BHA_BITCOIND_RPC_URL`    | Bitcoin's RPC binding                                     |
| `BHA_DATUM_API_URL`       | Datum Gateway's web binding                               |
| `BHA_ELECTRS_HOST` / `_PORT` | Electrs's Electrum binding, split into host and port  |
| `BHA_PAYOUT_SOURCE`       | Fixed to `electrs`, since Electrs is a required dependency |

The third is Bitcoin's RPC authentication, read off the volume Bitcoin publishes for dependents rather than asked of the operator: `.cookie` is `__cookie__:<secret>`, and the two halves become `BHA_BITCOIND_RPC_USER` and `BHA_BITCOIND_RPC_PASSWORD`.

**Ownership is the part that surprises people.** The application resolves configuration as *environment beats database beats defaults*, so every variable above is re-asserted on each start and a value edited in the dashboard for one of those fields is overwritten on the next restart. That is deliberate — a saved bridge address goes stale the moment a dependency is reinstalled on a different port. Every other setting in the dashboard belongs to the operator and this package never touches it.

## Dependencies

Three, all required, and all of them must be **synced**, not merely running — a partial answer here is a wrong answer, not a late one.

| Dependency                    | Health checks required   | Why                                                                    |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| Bitcoin (`bitcoind`)          | `bitcoind`, `sync-progress` | Block headers for BIP-110 checks, and the fallback for payout lookups |
| Electrs (`electrs`)           | `electrs`, `sync`        | Address history, for tracking and backfilling payouts                  |
| Datum Gateway (`datum`)       | `datum`                  | Receives the rented hashrate and reports what the pool is producing    |

Bitcoin's `public` volume, which holds the RPC cookie Bitcoin publishes for dependents and none of its chain or wallet data, is mounted read-only at `/mnt/bitcoin`; only `.cookie` is read from it. Nothing is mounted from Electrs or Datum.

Only Datum's daemon check is required, deliberately: its stratum checks describe whether miners are connected, which is exactly the state a new operator has not reached yet, and requiring them would block startup during setup.

**If any of the three cannot be resolved, the daemon refuses to start** with a message naming which one. The alternative — omitting the variable — starts a service that reports no chain tip, no payouts and no pool statistics, which reads as an application bug rather than a missing dependency.

## Network Access and Interfaces

One interface, serving the dashboard, the setup wizard and the API from the same listener.

| Interface | Id   | Type | Port | Description                                        |
| --------- | ---- | ---- | ---- | -------------------------------------------------- |
| Dashboard | `ui` | ui   | 3010 | The dashboard, setup wizard and application API    |

The application's own password protects it once setup is complete; StartOS adds no gate of its own.

Note what this interface is *not*: the Datum statistics address this package resolves is an internal one, for reading pool statistics. The pool URL the operator enters into Hashrate Autopilot is the **public Stratum destination Braiins delivers hashrate to**, and it has to be reachable from the internet. Nothing in this package exposes it — port forwarding and dynamic DNS are the operator's.

## Installation and First-Run Flow

Install the three dependencies first and let them sync; this package will not start until they are up.

On a fresh volume the daemon serves a setup wizard rather than the dashboard. It asks for the Braiins access token, a dashboard password, hashrate and price limits, the public pool destination and the Ocean payout address; the dependency addresses are already filled in from the resolved bindings. Completing it writes to SQLite and turns the same daemon into the running service — there is no separate step and no StartOS action involved.

**The wizard is unauthenticated until it is finished**, because the password it asks for is what protects everything afterwards. Complete first-run setup from a connection you trust.

The controller starts in **DRY-RUN**: it evaluates and records what it would do without placing or changing anything. Promoting it to LIVE is a decision the operator makes on the Status page after reading the decisions it has been proposing.

### DATUM and Electrs monitoring settings

StartOS fills in the internal addresses when Autopilot starts. To check them, open **Config** in the Autopilot dashboard. The examples below show the field format; use the bridge address and port assigned to each service on your server.

| Dashboard field | Example | What to enter |
| --- | --- | --- |
| **Datum stats API (optional)** | `http://10.0.3.1:64058` | HTTP base URL for the DATUM **web** interface, in the form `http://HOST:PORT`. Leave off `/umbrel-api`; Autopilot adds the path. |
| **Payout source** | **Electrum server (recommended)** | Select this option to track payouts through Electrs. The configuration value is `electrs`. |
| **Electrum server host** | `10.0.3.1` | Enter only the hostname or IP address. Leave the scheme and port out of this field. |
| **Port** | `50001` | Enter the numeric port assigned to Electrs’s plaintext Electrum TCP interface. |

Use **Test connection** beside each endpoint. DATUM reports gateway workers and estimated hashrate. Electrs checks the Bitcoin chain for payouts; let it finish syncing before relying on its history. The **Pool URL** is a separate setting for the public Stratum address where Braiins delivers hashrate.

## Actions

None. Setup, configuration, run-mode selection and diagnostics all live in the application's own dashboard, so there is nothing StartOS can offer that the dashboard does not do better.

## Tasks

None. This package raises no tasks, so the service is never held on a prompt and its ordinary controls are always available.

Dependency requirements are enforced by StartOS's own dependency handling instead, and a dependency that is present but unreachable surfaces as a failed start with an explanatory message in the service log.

## Health Checks

Two checks, on the only daemon.

| Check     | Displayed   | Method                                                                 |
| --------- | ----------- | ---------------------------------------------------------------------- |
| `primary` | "Dashboard" | Port 3010 is listening                                                 |
| `setup`   | "Setup"     | `GET /api/health` inside the container; fails while `mode` is `NEEDS_SETUP` |

While the installed Bitcoin is too old to publish its `public` volume, the package mounts nothing from it and runs no daemon: a lone `bitcoin` check, "Bitcoin Connection", fails and asks for Bitcoin to be updated. The installed manifest is watched, so updating Bitcoin starts the service normally.

`setup` fails until the wizard is completed, because until then anyone who can reach the address can claim the instance. Once it has passed it stops polling for the life of that run.

A `primary` failure means the daemon exited — most often because a dependency could not be resolved at start, which the service log states directly, naming which one.

Understand what it does **not** cover: a listening dashboard says nothing about whether the Braiins API is reachable, whether a bid is live, whether the pool is receiving hashrate, or whether payouts are arriving. Those are the application's own concern and it raises its own alerts for them, visible on the dashboard and on the Alerts page. A green health check on a service that has silently stopped bidding is expected behavior, not a broken check.

## Backups and Restore

The whole `main` volume is copied wholesale — `sdk.Backups.ofVolumes('main')` — which in practice means the one SQLite database. Nothing is excluded.

A restored instance is fully configured: the Braiins token, dashboard password, limits, pool destination and the whole decision and payout history come back with it. Dependency addresses do not need to, since they are resolved fresh on every start, so a restore onto a server whose Bitcoin, Electrs or Datum sit on different ports needs no intervention.

The one thing to decide before restoring is the run mode you want. A backup taken while the controller was LIVE restores as LIVE, and the controller resumes bidding as soon as its dependencies are healthy.

## Limitations and Differences

1. **Run mode does not stop an existing bid.** DRY-RUN and PAUSED prevent new create, edit and cancel calls; neither cancels a bid that is already active, and delivery and spend continue. To stop spending, cancel the bid on the Braiins marketplace and confirm it is inactive there. Keep DRY-RUN on until the targets, price ceilings and proposed decisions all look right.
2. **The setup wizard is unauthenticated until it is completed.** The dashboard password only takes effect afterwards, so run first-run setup from a trusted connection.
3. **Pool ingress is the operator's to arrange.** This package exposes no public Stratum endpoint and configures no port forwarding or dynamic DNS. Verify the exact public pool destination before going LIVE.
4. **The dependency-derived settings are re-asserted on every start** and cannot be changed from the dashboard — the Bitcoin RPC URL and credentials, the Datum statistics URL, the Electrs endpoint, and the payout source. Editing them in the UI appears to work and reverts on the next restart.
5. **Uninstalling deletes everything**, including the encrypted secrets and the full history. Back up first.
6. **x86_64 and aarch64 only.**
7. **The packaged version can lag upstream.** The manifest pins the published upstream image by digest; a newer upstream release ships here only once that pin is bumped.

---

## Quick Reference for AI Consumers

```yaml
package_id: hashrate-autopilot
image: ghcr.io/rdouma/hashrate-autopilot:1.18.4
architectures:
  - x86_64
  - aarch64
subcontainers:
  - hashrate-autopilot-sub # the only container
volumes:
  main: /app/data # state.db is the entire service state
file_models: []
startos_managed_env_vars:
  - NODE_ENV
  - HTTP_HOST
  - HTTP_PORT
  - DB_PATH
  - DASHBOARD_STATIC
  - APP_VERSION
  - BHA_BITCOIND_RPC_URL
  - BHA_BITCOIND_RPC_USER # from bitcoind's .cookie
  - BHA_BITCOIND_RPC_PASSWORD # from bitcoind's .cookie
  - BHA_DATUM_API_URL
  - BHA_ELECTRS_HOST
  - BHA_ELECTRS_PORT
  - BHA_PAYOUT_SOURCE
dependencies:
  - bitcoind # required; health checks bitcoind, sync-progress; public volume mounted read-only at /mnt/bitcoin
  - electrs # required; health checks electrs, sync
  - datum # required; health check datum
interfaces:
  ui: { type: ui, port: 3010 }
actions: []
tasks: []
health_checks:
  - primary # displayed "Dashboard"
  - setup # displayed "Setup"; fails until the setup wizard is completed
  - bitcoin # displayed "Bitcoin Connection"; only while the installed Bitcoin predates its public volume
```
