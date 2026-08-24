# Hashrate Autopilot

> [!WARNING]
> **This service spends real money on your behalf.** It bids on the Braiins Hashpower marketplace and pays for the hashrate it wins. It starts in **DRY-RUN**, where it only proposes decisions, and it stays there until you switch it to LIVE yourself. Leave it in DRY-RUN until the decisions it is proposing look right to you.

> [!IMPORTANT]
> **Install Bitcoin, Electrs and Datum Gateway first, and let them finish syncing.** Hashrate Autopilot will not start until all three are up and synced. They find each other automatically — there is nothing for you to copy across.

## Documentation

- [Hashrate Autopilot README](https://github.com/rdouma/hashrate-autopilot#readme) — what the project is and how the controller decides what to bid.
- [Upstream documentation](https://github.com/rdouma/hashrate-autopilot/tree/main/docs) — operating, architecture and safety guidance.
- [Configuration reference](https://github.com/rdouma/hashrate-autopilot/blob/main/docs/configuration.md) — every dashboard setting, explained.

## What you get on StartOS

- The full Hashrate Autopilot dashboard — bidding, charts, alerts, payout tracking and the setup wizard — on one address.
- Bitcoin, Electrs and Datum Gateway wired up for you, including Bitcoin's RPC login. You will not be asked for a node address or credentials anywhere in the wizard.
- Everything the service knows — your settings, your Braiins token, and the whole history of what it bid and what it earned — in a single database that your server backs up with the rest of the service.

## Getting set up

1. **Open the Dashboard.** On a fresh install it opens the setup wizard rather than the dashboard.

   > The wizard is not password-protected — the password it asks you for is what protects everything afterwards. Do this from a device and network you trust.
2. **Fill in the wizard.** It asks for your Braiins access token, a dashboard password, your hashrate target and price ceiling, your public pool destination, and your Ocean worker name and payout address. The read-only Braiins token is optional.
3. **Get the pool destination right — this is the step people get wrong.** It must be the **public** Stratum address Braiins will deliver hashrate to, reachable from the internet. It is *not* the Datum address shown elsewhere in the dashboard, which is only used to read your pool's statistics. Arranging that public address — port forwarding, dynamic DNS, the hostname itself — is up to you, and your server does not do it for you.
4. **Leave it in DRY-RUN and watch it.** On the Status page you will see the decisions it *would* make: what it would bid, at what price, and why. Check them against your own expectations, along with your target hashrate and price ceiling.
5. **Confirm your public pool destination actually accepts traffic** for the worker name you entered, from outside your network.
6. **Switch to LIVE** on the Status page, once and only once steps 4 and 5 both look right. From that moment it bids with real funds.

## Using Hashrate Autopilot

Everything happens on the Dashboard: monitoring the marketplace, your pool and your payouts; changing settings; reviewing decisions; and switching between DRY-RUN, LIVE and PAUSED. This package adds no separate controls of its own.

### Switching to DRY-RUN or PAUSED does not cancel a bid you already have

This is the most important thing to know about the run modes. DRY-RUN and PAUSED stop it from making **new** changes — creating, editing or cancelling bids. Neither one retracts a bid that is already live, and that bid keeps delivering hashrate and keeps costing you money.

To actually stop spending, go to the Braiins marketplace, cancel the bid there, and confirm it shows as inactive. Only then is the spending stopped.

### A few settings are managed for you

The Bitcoin, Electrs and Datum addresses — and Bitcoin's login — are filled in from your installed services every time Hashrate Autopilot starts, so they keep working when those services move or are reinstalled. If you edit one of them in the dashboard it will look like it saved, and then go back on the next restart. That is deliberate. Everything else in the dashboard is yours.

### Alerts are the application's, not your server's

A green health check on the service page only means the dashboard is answering. It does not mean a bid is live, that your pool is receiving hashrate, or that payouts are arriving. Hashrate Autopilot raises its own alerts for those, on the dashboard and the Alerts page — that is where to look.

## Restoring from a backup

A restore brings back everything: your settings, your Braiins token, and the full history of decisions and payouts. The connections to Bitcoin, Electrs and Datum are worked out afresh on every start, so they still work even if those services came back on different addresses.

One thing to decide before you restore: **a backup taken while it was LIVE comes back LIVE**, and starts bidding again as soon as its dependencies are healthy.

## Limitations

- **Uninstalling deletes everything**, including your Braiins token and the whole history. Back up first if you want any of it.
- **Public Stratum ingress is yours to arrange.** This service does not open a port, forward one, or manage a hostname for you.
