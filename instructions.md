# Hashrate Autopilot

## Documentation

- [Upstream repository](https://github.com/rdouma/hashrate-autopilot) — the project README and source of truth for application behavior.
- [Upstream documentation](https://github.com/rdouma/hashrate-autopilot/tree/main/docs) — detailed operating, architecture, and safety guidance.
- [Configuration reference](https://github.com/rdouma/hashrate-autopilot/blob/main/docs/configuration.md) — dashboard settings and supported environment overrides.

## What you get on StartOS

The Dashboard opens Hashrate Autopilot's setup wizard and, after setup, its monitoring and control
interface. Your configuration, application secrets, SQLite state, and retained history persist in the
service data volume and are included together when you back up the service.

Bitcoin, Electrs, and Datum are required services. StartOS resolves their installed-package bindings
to managed bridge addresses; during fresh setup, Hashrate Autopilot pre-fills those values and selects
Electrs for payout tracking. The managed Datum statistics URL is preferred on every poll so a saved
value cannot retain an obsolete assigned bridge port. Datum receives rented hashrate only when your
public pool destination routes to it.

## Getting set up

1. Open the Dashboard and complete the setup wizard. Enter your Braiins owner token, a dashboard
   password, hashrate targets, price limits, public pool destination, Ocean worker identity, and payout
   address. The optional read-only Braiins token can also be entered here.
2. Set the pool destination to the public Datum Stratum endpoint that Braiins can reach. Do not use the
   internal Datum statistics address as the pool destination. Confirm the hostname, port forwarding,
   worker identity, and Ocean payout address before continuing.
3. Confirm that the wizard shows the package-provided StartOS dependency values and Electrs payout
   tracking. The Bitcoin RPC URL, Electrs endpoint, and payout backend are startup settings; a restart
   rebuilds those integrations with the SDK-resolved values. StartOS also manages the Datum statistics
   URL, which remains authoritative over its saved dashboard value while the package supplies it.
4. Complete the wizard and leave the controller in **DRY-RUN**. Check the Status page, service health,
   proposed decisions, price ceilings, target hashrate, and destination routing without issuing new bid
   mutations. Inspect the Braiins marketplace separately and confirm any existing bid is inactive if you
   expect delivery and spend to be stopped.
5. Verify independently that the public Datum/pool destination accepts traffic for the intended Ocean
   worker. Switch to **LIVE** only after the DRY-RUN decisions and the public destination are correct.

## Using Hashrate Autopilot

Use the Dashboard to monitor marketplace, Datum, Ocean, and payout information; change configuration;
review proposed or executed bid decisions; and select DRY-RUN, LIVE, or PAUSED. The package adds no
separate StartOS actions.

Keep DRY-RUN as the boot mode until the setup is proven. DRY-RUN and PAUSED prevent the controller from
issuing new create, edit, or cancel API mutations. Switching modes does not cancel an already-active
Braiins bid or stop its ongoing delivery and spend. Inspect and cancel existing marketplace bids
separately, then confirm they are inactive. LIVE permits real bid mutations with real funds.

Back up the service before uninstalling if you need to retain its configuration or history. Restoring
that backup restores the complete service data volume.

## Limitations

- StartOS resolves the Bitcoin RPC, Electrs, and Datum bindings to assigned bridge endpoints. The
  Bitcoin RPC URL, Electrs endpoint, and payout backend are applied to boot-time clients; the managed
  Datum URL is preferred on every poll. Bitcoin RPC credentials are not included.
- The internal Datum address is for statistics only. Public Stratum ingress, router forwarding, and
  dynamic DNS remain your responsibility.
- Initial setup is not protected by the application password until you complete the wizard; use a
  trusted connection.
- LIVE mode can spend marketplace funds, and uninstalling without a backup removes all persistent
  service data.
