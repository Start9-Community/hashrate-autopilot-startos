<p align="center">
  <img src="icon.png" alt="Hashrate Autopilot logo" width="21%" />
</p>

# Hashrate Autopilot on StartOS

> **Upstream documentation:** <https://github.com/rdouma/hashrate-autopilot#readme>
>
> Everything not listed here follows the upstream Hashrate Autopilot documentation. If a feature,
> setting, or behavior is not mentioned in this README, the upstream documentation applies.

This repository packages [Hashrate Autopilot](https://github.com/rdouma/hashrate-autopilot) for
StartOS. Hashrate Autopilot monitors and controls an operator's Braiins Hashpower marketplace bid and
routes rented hashrate to an operator-selected mining pool destination.

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Configuration Management](#configuration-management)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Actions (StartOS UI)](#actions-startos-ui)
- [Backups and Restore](#backups-and-restore)
- [Health Checks](#health-checks)
- [Dependencies](#dependencies)
- [Limitations and Differences](#limitations-and-differences)
- [What Is Unchanged from Upstream](#what-is-unchanged-from-upstream)
- [Contributing](#contributing)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

StartOS builds the `main` image from [`Dockerfile.startos`](Dockerfile.startos) for `x86_64` and
`aarch64`. The Dockerfile consumes the repository's prebuilt daemon, dashboard, shared-library, and
build-metadata outputs rather than an upstream prebuilt image.

The `primary` daemon runs:

```text
node packages/daemon/dist/main.js
```

The image working directory is `/app`, and its persistent data directory is created at `/app/data`.

## Volume and Data Layout

The writable StartOS volume `main` is mounted at `/app/data`. It contains the SQLite database at
`/app/data/state.db`, including operator configuration, encrypted application secrets, runtime state,
and retained history. Data elsewhere in the container is part of the replaceable image and is not
persistent package state.

Uninstalling the package deletes the `main` volume. Back it up first if the configuration or history
must be retained.

## Installation and First-Run Flow

On a fresh data volume, the daemon serves the dashboard setup wizard. The operator supplies the
Braiins access token, dashboard password, hashrate and pricing limits, public pool destination, Ocean
payout address, and related settings. StartOS-provided dependency values are prefilled where the wizard
supports them and enforced as environment overrides when the daemon enters normal operation.

Completing the wizard writes configuration and application secrets to SQLite and transitions the same
daemon into normal operation. The controller starts in **DRY-RUN**, so proposed marketplace changes
are recorded without being executed. The operator promotes the controller to **LIVE** from the Status
page only after checking the configuration, observed decisions, and pool routing.

## Configuration Management

Most operator settings belong to Hashrate Autopilot and are managed in its setup wizard and dashboard.
The package also sets the following process environment variables in
[`startos/main.ts`](startos/main.ts):

| Variable | Meaning |
| --- | --- |
| `NODE_ENV` | Runs the daemon in production mode. |
| `HTTP_HOST` | Binds the daemon to all container interfaces. |
| `HTTP_PORT` | Serves the dashboard and API on internal port `3010`. |
| `DB_PATH` | Places SQLite in the persistent `main` volume. |
| `DASHBOARD_STATIC` | Selects the packaged dashboard asset directory. |
| `APP_VERSION` | Exposes package build/version metadata to the application. |
| `BHA_BITCOIND_RPC_URL` | Supplies the internal RPC URL for the required `bitcoind` service. |
| `BHA_DATUM_API_URL` | Supplies the internal statistics URL for the required `datum` service. |
| `BHA_ELECTRS_HOST` | Supplies the internal hostname for the required `electrs` service. |
| `BHA_ELECTRS_PORT` | Supplies the Electrum protocol port for `electrs`. |
| `BHA_PAYOUT_SOURCE` | Selects Electrs as the default payout-tracking backend. |

These variables contain routing and runtime values, not operator credentials. Hashrate Autopilot stores
wizard and dashboard configuration in SQLite, but the five `BHA_*` dependency values above are runtime
overrides: they take precedence over stored endpoint and payout-backend choices whenever the packaged
daemon starts. Changing those fields in the dashboard does not change the effective StartOS runtime.

## Network Access and Interfaces

The package defines one interface:

| Interface | Protocol | Internal port | Purpose |
| --- | --- | --- | --- |
| `ui` | HTTP | `3010` | Dashboard, setup wizard, and application API |

StartOS publishes `ui` as the Dashboard interface and prefers the standard external HTTP port. The
daemon serves the dashboard and API from the same listener.

The `BHA_DATUM_API_URL` default is an internal statistics connection. It is not the public Stratum
destination that Braiins needs. The pool URL entered in Hashrate Autopilot must resolve to a Datum or
other pool endpoint reachable from the public internet.

## Actions (StartOS UI)

This package defines no StartOS actions. Setup, configuration, DRY-RUN/LIVE/PAUSED selection, and
application diagnostics are available in the Hashrate Autopilot dashboard.

## Backups and Restore

Backup and restore operate on the full `main` volume. A backup therefore includes the SQLite database,
operator configuration, application secrets, runtime state, and retained history. Restore initializes
the package from that volume; no paths within `main` are excluded.

## Health Checks

StartOS marks the `primary` daemon ready when its port-listening check can connect to internal port
`3010`. The displayed result is `Dashboard is ready` on success and `Dashboard is not responding` on
failure. This readiness check confirms that the listener is available; it does not validate external
marketplace, pool, node, or payout services.

## Dependencies

All three dependencies are required and declared as running services. The wrapper adds no separate
dependency health checks and mounts no dependency volumes.

| Package ID | Declared purpose |
| --- | --- |
| `bitcoind` | Provides the local Bitcoin node used by Datum Gateway and optional BIP 110 block-header checks. |
| `electrs` | Provides Electrum lookups for Ocean payout tracking and historical payout backfill. |
| `datum` | Receives rented hashrate from Braiins and exposes Datum Gateway statistics to the dashboard. |

## Limitations and Differences

1. **LIVE mode can spend real funds.** The owner-scope Braiins token allows the application to create,
   edit, and cancel marketplace bids. Keep DRY-RUN enabled until targets, price ceilings, and observed
   decisions are correct.
2. **Pool ingress is operator-managed.** The package does not expose a public Datum Stratum endpoint or
   configure router forwarding and dynamic DNS. Verify the exact public pool destination before LIVE.
3. **Dependency routing is package-managed.** The wrapper enforces the internal Bitcoin, Datum, and
   Electrs locations and selects Electrs for payout tracking whenever the daemon starts. Dashboard edits
   to those endpoints or the payout backend do not override the package. Bitcoin RPC credentials are not
   embedded.
4. **The setup wizard is initially unauthenticated.** The application password takes effect after setup,
   so complete first-run setup from a trusted connection.
5. **Uninstall removes persistent state.** Preserve the `main` volume with a backup before uninstalling
   if the package must retain configuration or history.
6. **Architectures are limited to the declared image builds.** The package supplies `x86_64` and
   `aarch64` images only.

## What Is Unchanged from Upstream

The controller logic, dashboard features, configuration schema, marketplace integration, pool and
payout observations, alerts, retention behavior, and application authentication come from upstream
Hashrate Autopilot. Use the [upstream repository](https://github.com/rdouma/hashrate-autopilot),
[upstream documentation](https://github.com/rdouma/hashrate-autopilot/tree/main/docs), and
[configuration reference](https://github.com/rdouma/hashrate-autopilot/blob/main/docs/configuration.md)
for behavior not specifically changed by this StartOS wrapper.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository scope, build commands, test commands, and the
upstream-sync policy. Contributions are released under the [MIT license](LICENSE).

---

## Quick Reference for AI Consumers

```yaml
package_id: hashrate-autopilot-9
image:
  id: main
  source: Dockerfile.startos
  architectures: [x86_64, aarch64]
  entrypoint: [node, packages/daemon/dist/main.js]
volumes:
  main: /app/data
database: /app/data/state.db
interfaces:
  ui:
    protocol: http
    internal_port: 3010
actions: []
health_check: port-listening
backups: [main]
dependencies: [bitcoind, electrs, datum]
startos_managed_env_vars:
  - NODE_ENV
  - HTTP_HOST
  - HTTP_PORT
  - DB_PATH
  - DASHBOARD_STATIC
  - APP_VERSION
  - BHA_BITCOIND_RPC_URL
  - BHA_DATUM_API_URL
  - BHA_ELECTRS_HOST
  - BHA_ELECTRS_PORT
  - BHA_PAYOUT_SOURCE
default_run_mode: DRY-RUN
```
