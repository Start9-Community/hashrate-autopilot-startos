# Frequently Asked Questions

Short, get-you-started answers to the questions that come up most. For the full picture, see the [README](README.md) and
the [docs](docs/). If your question isn't here, open an [issue](https://github.com/rdouma/hashrate-autopilot/issues) or
a [discussion](https://github.com/rdouma/hashrate-autopilot/discussions).

New to how the pieces fit together? Start with [How does this all fit together?](#how-does-this-all-fit-together) - most
setup confusion clears up once that picture is in place.

---

## Setup & topology

### How does this all fit together?

There are three moving parts, and Hashrate Autopilot only drives one of them:

```
  Braiins Hashpower  →  your Datum Gateway  →  Ocean pool
  (you rent hashrate)   (Stratum in the middle)  (you mine, non-custodial)

  Hashrate Autopilot watches all three over their APIs and places your bids.
  It never sits in the path your hashrate actually flows through.
```

You rent hashrate on the **Braiins Hashpower** marketplace. Braiins sends that hashrate to a **Stratum** endpoint you
choose - normally your own **Datum Gateway**, which forwards it to the **Ocean** pool. Hashrate Autopilot is a separate
program that talks to Braiins and Ocean through their APIs to decide what to bid and to show you what's happening. It is
the autopilot, not the pipe.

### What do I put in the "Stratum host" / Pool URL, and why did my internal IP not work?

It has to be an address **reachable from the public internet**, because Braiins connects *into* your Datum Gateway from
their servers to deliver your hashrate. A LAN address like `192.168.x.x` or `10.x.x.x` only works inside your own house,
so Braiins can't reach it and the hashrate goes nowhere.

Use a dynamic-DNS hostname (DuckDNS, No-IP, and similar) pointed at your home connection, and forward your Datum
Gateway's Stratum port on your router. Give Braiins that `hostname:port`. The app has a built-in DDNS updater under
Config → Pool & Payout so the hostname keeps up with your changing IP. Quick test: try reaching it from your phone on
mobile data - if that can't connect, neither can Braiins.

### The dashboard shows hashrate being delivered, but Ocean credits me nothing. Why?

Most likely your **worker identity** is wrong. Ocean credits earnings to the Bitcoin address embedded in the worker
name, so it has to be `<your-btc-payout-address>.<a-label>`, e.g. `bc1q...abc.autopilot`. A bare label with no
address in front is accepted by the pool but credited to nobody, so you'd pay for hashrate and earn nothing. The app
checks the shape when you save it, but make sure the address is actually your Ocean payout address.

### Where does the daemon run versus my node?

They can be on the same machine or on different ones. The autopilot is lightweight and just needs network access to the
internet and to your Bitcoin node and Electrum server. On Umbrel everything runs together and is auto-detected. In a
split setup, your node and electrs can live on your Umbrel (or anywhere), and you point the app at them - the autopilot
doesn't have to run on the same box.

---

## Payouts & Profit/Loss

### Why does my Profit & Loss show a loss, especially early on?

Because you pay for hashrate up front, but earnings arrive later. The moment you bid, "spent" goes up. What you mine
builds up at Ocean as an **unpaid balance** and only counts as "collected" once Ocean actually pays it out. Early in a
run you've spent real money but little has been paid yet, so the ratio looks bad - it improves as payouts land. Earnings
you've made but not yet been paid show as your unpaid balance, not as collected.

### How do Ocean payouts work? When do I get paid?

Ocean adds up your earnings as an unpaid balance and pays out once it crosses a threshold (on-chain: 1,048,576 sat,
about 0.0105 BTC). Below that it just keeps growing. How fast you get there depends on your hashrate and the pool's
luck, not a fixed schedule, and nothing expires while you wait.

### On-chain versus Lightning payouts - what's the difference?

On-chain payouts are reported fully by Ocean's API, so your "collected" figure is exact. Lightning payouts are faster
and smaller, but Ocean's API doesn't report them yet, so the app deduces them from your unpaid balance dropping. 
Both work; it comes down to exact accounting (on-chain) versus payout speed (Lightning).

### What is the "Pre-installation earnings" field for?

It's a manual number added to your "collected" total, for payouts the app couldn't see itself, such as payouts from 
before you installed the app (or before version 1.5.0, which is the first version that started tracking unpaid 
payouts). Don't include amounts the app already counts or you'll double up. Config → Pool & Payout.

---

## Bidding & safety

### What do DRY_RUN, LIVE, and PAUSED mean?

- **LIVE** - places and edits real bids with real money.
- **DRY_RUN** - does everything *except* place bids, and shows you what it *would* have done.
- **PAUSED** - stops acting entirely.

Running DRY_RUN for a while first is a cheap way to sanity-check your setup before spending, but it's optional. The
switch is on the Status page.

### What's the difference between "max bid" and "cheap mode"?

Max bid is your absolute ceiling. Autopilot never bids above it. Cheap mode is the opposite lever: when the market 
gets cheap (as measured against hashprice as reported by Ocean), it raises your target so you buy more while it's 
cheap. One caps spending, the other opportunistically increases it. Both live under Config → Strategy.

### Why isn't the autopilot placing or changing my bid?

Usually the mode: only **LIVE** places and edits real bids - DRY_RUN just shows what it *would* do, and PAUSED does nothing. Other common reasons are that a recent Braiins deposit hasn't cleared its screening yet (nothing spendable to bid with), or you've hit a Braiins limit - notably, a bid's price can only be lowered once every 10 minutes. You don't need to approve anything in Telegram: that Telegram confirmation is part of Braiins' own web interface, not the API the autopilot uses.

### I deposited to Braiins but still can't bid. Why?

New Braiins deposits go through a compliance screening before they're spendable, so there's a delay (usually minutes)
between the deposit confirming and being able to bid with it. The dashboard shows it as detected first, then available
once it clears.

---

## Requirements

### Do I need to run my own Bitcoin node?

For the on-chain part of your Profit & Loss - payouts landing in your wallet - yes: it's read through a Bitcoin node and
an Electrum server (electrs, Fulcrum, or ElectrumX). It doesn't have to be a new one: if you run Umbrel, its node and
Electrs already cover this and you just point the app at them. The node doesn't have to be on the same machine as the
autopilot.

### Does the machine need to stay on all the time?

Yes. The autopilot bids, edits, and watches for problems continuously, so it runs as an always-on service. If it's off,
it isn't managing your bids. It's light enough for a small always-on box.

### Community App Store version versus the official Umbrel App Store version?

They're two separate apps with different IDs, so installing the official-store one doesn't carry your data over from the
community-store one - it starts empty. There's a short one-time migration to bring your history
across: [docs/migrating-from-community-store.md](docs/migrating-from-community-store.md). The community store sometimes
gets a new version first for testing before it's promoted to the official store.

---

*This FAQ is versioned with the code. Spot something out of date or missing? A PR or an issue is welcome.*