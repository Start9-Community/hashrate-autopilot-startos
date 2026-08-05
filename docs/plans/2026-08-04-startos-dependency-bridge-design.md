# StartOS Dependency Bridge Address Design

## Context

Hashrate Autopilot currently reaches Bitcoin, DATUM, and Electrs through legacy
`*.startos` DNS names and fixed service ports. StartOS 0.4 packages must instead ask
the SDK for managed bridge addresses. The returned bridge port is assigned by
StartOS and cannot be predicted safely.

## Decision

Resolve each dependency during `setupMain` with
`sdk.host.getBridgeAddress(...).const()` using its published package, host, and
internal-port contract:

| dependency | package | host | internal port | TLS |
|---|---|---|---:|---|
| Bitcoin RPC | `bitcoind` | `rpc` | 8332 | false |
| DATUM API | `datum` | `main` | 7152 | false |
| Electrs | `electrs` | `electrum` | 50001 | false |

Convert resolved HTTP addresses into full URLs for Bitcoin and DATUM. Split the
Electrs bridge address into host and port because the daemon accepts those as
separate settings. Keep the conversion logic pure and unit tested.

DATUM normally re-reads its saved SQLite URL on every poll. While a
`BHA_DATUM_API_URL` override is present, the poller must prefer that override on
every read so an upgrade or newly assigned bridge port cannot fall back to a stale
saved endpoint. Without an override, ordinary dashboard configuration behavior is
unchanged.

When a dependency is not installed or available, omit only that dependency's
environment overrides. This preserves the application's existing safe no-data
behavior, while `.const()` causes StartOS to regenerate and restart the main
action when the dependency later becomes available.

## Alternatives Rejected

- Keep `*.startos` DNS names: deprecated in StartOS 0.4 and bypasses the managed
  bridge-address contract.
- Hardcode bridge ports: bridge ports are assigned dynamically and may change.
- Make dependencies mandatory startup requirements: the application is designed
  to start safely while optional data sources are unavailable.

## Testing

- Unit-test resolved IPv4 and bracketed IPv6 Electrs addresses.
- Unit-test omission of overrides for missing dependencies.
- Include the StartOS wrapper as an isolated Vitest project.
- Unit-test that the managed DATUM environment address wins over saved state.
- Add a packaging regression check that rejects runtime `*.startos` service
  addresses and requires managed bridge resolution.
- Run TypeScript checks, the full test suite, the Community Registry contract
  check, and both StartOS architecture builds.

Physical sideload and uninstall/reinstall validation remain a manual handoff to
the package owner.
