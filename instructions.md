# Hashrate Autopilot

## Documentation

- [Upstream repository](https://github.com/rdouma/hashrate-autopilot) — the project README and source of truth for application behavior.
- [Upstream documentation](https://github.com/rdouma/hashrate-autopilot/tree/main/docs) — detailed operating, architecture, and safety guidance.
- [Configuration reference](https://github.com/rdouma/hashrate-autopilot/blob/main/docs/configuration.md) — dashboard settings and supported environment overrides.

## What you get on StartOS

The Dashboard opens Hashrate Autopilot's setup wizard and, after setup, its monitoring and control
interface. Your configuration, application secrets, SQLite state, and retained history persist in the
service data volume and are included together when you back up the service.

Bitcoin, Electrs, and Datum are required services. The package uses their internal StartOS addresses,
selects Electrs for payout tracking, uses the local Bitcoin node address for RPC features, and uses
Datum for dashboard statistics.

## Getting set up

1. Open the Dashboard and complete the setup wizard. Enter your Braiins owner token, a dashboard
   password, hashrate targets, price limits, Ocean payout address, and payout-tracking choice.
2. Set the pool destination to the public Datum Stratum endpoint that Braiins can reach. Do not use the
   internal Datum statistics address as the pool destination. Confirm the hostname, port forwarding,
   worker identity, and Ocean payout address before continuing.
3. Confirm that the wizard shows the expected StartOS dependency values and Electrs payout tracking.
   The package reapplies those internal addresses and the Electrs backend when the daemon starts, so
   changes to those fields do not alter the packaged runtime.
4. Complete the wizard and leave the controller in **DRY-RUN**. Check the Status page, service health,
   proposed decisions, price ceilings, target hashrate, and destination routing without executing bids.
5. Verify independently that the public Datum/pool destination accepts traffic for the intended Ocean
   worker. Switch to **LIVE** only after the DRY-RUN decisions and the public destination are correct.

## Using Hashrate Autopilot

Use the Dashboard to monitor marketplace, Datum, Ocean, and payout information; change configuration;
review proposed or executed bid decisions; and select DRY-RUN, LIVE, or PAUSED. The package adds no
separate StartOS actions.

Keep DRY-RUN as the boot mode until the setup is proven. LIVE permits the controller to create, edit,
and cancel real Braiins bids with real funds. PAUSED prevents bid changes until you choose another run
mode.

Back up the service before uninstalling if you need to retain its configuration or history. Restoring
that backup restores the complete service data volume.

## Limitations

- The package fixes the internal dependency addresses and Electrs payout backend at runtime. Dashboard
  changes to those values do not override the package, and Bitcoin RPC credentials are not included.
- The internal Datum address is for statistics only. Public Stratum ingress, router forwarding, and
  dynamic DNS remain your responsibility.
- Initial setup is not protected by the application password until you complete the wizard; use a
  trusted connection.
- LIVE mode can spend marketplace funds, and uninstalling without a backup removes all persistent
  service data.
