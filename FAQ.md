# Frequently Asked Questions

Short answers first, with an optional "more technical detail" under each where it helps. If your question isn't here, open an [issue](https://github.com/rdouma/hashrate-autopilot/issues) or a [discussion](https://github.com/rdouma/hashrate-autopilot/discussions).

New to how the pieces fit together? Start with [How does this all fit together?](#how-does-this-all-fit-together) - most setup confusion clears up once that picture is in place.

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

You rent hashrate on the **Braiins Hashpower** marketplace. Braiins sends that hashrate to a **Stratum** endpoint you choose - normally your own **Datum Gateway**, which forwards it to the **Ocean** pool. Hashrate Autopilot is a separate program that talks to Braiins and Ocean through their APIs to decide what to bid and to show you what's happening. It is the autopilot, not the pipe.

<details>
<summary>More technical detail</summary>

The share path is `Braiins → Datum Gateway (Stratum V1, default port 23334) → Ocean (DATUM protocol)`. The autopilot never touches shares; it only calls the Braiins REST API (to read the market and place/edit/cancel bids) and Ocean's API (to read your hashrate, unpaid balance, and payouts). That separation is why the daemon can run on a small machine that isn't in the mining path at all - see [Where does the daemon run versus my node?](#where-does-the-daemon-run-versus-my-node).

</details>

### What do I put in the "Stratum host" / Pool URL, and why did my internal IP not work?

It has to be an address **reachable from the public internet** - a DDNS hostname (or public IP) with the Stratum port forwarded to your Datum Gateway. A LAN address like `192.168.x.x` or `10.x.x.x` only works inside your own house.

Braiins delivers your rented hashrate by connecting **into** your Datum Gateway from their servers out on the internet. If you give them a private LAN address, their servers can't reach it, so the hashrate goes nowhere and you pay for nothing.

<details>
<summary>More technical detail</summary>

Concretely you need:

1. **A public name for your connection.** Home internet usually has a changing IP, so use a dynamic-DNS hostname (e.g. DuckDNS, No-IP). Hashrate Autopilot has a built-in DDNS updater - set it up under Config → Pool & Payout so the hostname always points at your current IP, even after your ISP rotates it.
2. **A port-forward** on your router from the chosen external port to your Datum Gateway's Stratum port (default `23334`) on the machine running Datum.
3. Give Braiins that `your-hostname:port`.

Test it from *outside* your network (e.g. phone on mobile data, `nc your-hostname 23334`) - if that can't connect, Braiins can't either.

</details>

### The dashboard shows hashrate being delivered, but Ocean credits me nothing. Why?

Almost always the **worker identity** is wrong. Ocean credits earnings to the Bitcoin address embedded in the worker name, so the identity has to be `<your-btc-payout-address>.<a-label>` - for example `bc1q...abc.rented`. A bare label with no address prefix is accepted by the pool but credited to nobody.

<details>
<summary>More technical detail</summary>

With Datum Gateway's default `pool_pass_full_users=true`, Ocean routes rewards by the address in the identity string, not by the label. `worker1` alone → shares accepted upstream, credited to no one, and they never show on `ocean.xyz/stats/<addr>` because that address never saw a share. `bc1q...abc.worker1` → credited correctly. Hashrate Autopilot validates the shape when you save it, but double-check it matches your actual Ocean payout address.

</details>

### Where does the daemon run versus my node?

They can be on the same machine or on completely different ones. The autopilot itself is lightweight and just needs to reach the internet and your node/electrs over the network. Your Bitcoin node and electrs can live on your Umbrel, and the autopilot can run there too, or on any always-on machine that can talk to it.

<details>
<summary>More technical detail</summary>

On an Umbrel install everything co-locates and the dashboard auto-discovers the Datum HTTP API, electrs, and Bitcoin RPC across Umbrel's Docker network. In a split setup you point the daemon's Bitcoin RPC and electrs URLs (Config → Pool & Payout) at wherever those services actually run - e.g. your Umbrel's LAN IP - and Datum can be elsewhere again. The only hard requirement is that the daemon can reach each service it's configured to use.

</details>

---

## Payouts & Profit/Loss

### Why does my Profit & Loss show a loss, or a high loss rate - especially early on?

Because spend happens immediately and earnings arrive later. The moment you bid, "spent" goes up. Your mining earnings accumulate at Ocean as an **unpaid balance** and only become "collected" when Ocean actually pays you out. Early in a run you've spent real money but little has been paid out yet, so the ratio looks bad; it improves as payouts land.

<details>
<summary>More technical detail</summary>

The panel computes `net = collected + pre-installation offset + expected − spent`, where:

- **spent** = what you've paid Braiins for delivered hashrate (immediate).
- **collected** = what Ocean has actually paid you (on-chain payouts from Ocean's ledger, plus deduced Lightning payouts).
- **expected** = your current *unpaid* balance at Ocean (earned, not yet paid).
- **offset** = the "Pre-installation earnings" field (see below).

So money you've earned but not yet been paid sits in "expected", not "collected". The loss rate is `net / spent`. It starts deeply negative when only spend has happened and walks toward zero (and past it, if earnings exceed spend) as payouts arrive.

</details>

### How do Ocean payouts even work? When do I get paid?

Ocean accumulates your earnings as an unpaid balance and pays out once it crosses a threshold (on-chain: 1,048,576 sat, about 0.0105 BTC). Until then the balance just grows. Payout timing depends on your hashrate and pool luck, not a fixed schedule.

<details>
<summary>More technical detail</summary>

Ocean uses the **TIDES** model: a sliding ~8-block-difficulty share window; your shares earn a slice of every block Ocean finds while they're in the window. Earnings accumulate as `unpaid_earnings` and are swept once over the on-chain threshold (a discretionary lower floor of 65,536 sat applies if you stop mining or change address). Payouts arrive as batched sweep transactions, not always as a direct coinbase output. Lightning is an opt-in alternative rail that pays smaller amounts more often (see next question). None of this expires - shares that roll out of the window stop earning *new* rewards, but everything they already earned stays in your balance.

</details>

### On-chain versus Lightning payouts - what's the difference, and how does the app handle each?

**On-chain** payouts are reported fully by Ocean's API, so your P&L "collected" is exact. **Lightning** payouts are faster and smaller, but Ocean's API doesn't report them at all right now - so Hashrate Autopilot *deduces* them from your unpaid balance dropping, which is close but approximate. Both work; it's a tradeoff between exact accounting (on-chain) and payout speed (Lightning).

<details>
<summary>More technical detail</summary>

On-chain payouts come through Ocean's `earnpay` endpoint and are recorded exactly. Ocean confirmed (2026-07-15) their API has no way to fetch Lightning payouts yet. Since every payout - Lightning included - reduces the unpaid balance the app snapshots each minute, a confirmed sharp drop with no matching on-chain record is recorded as a deduced Lightning payout (the *amount removed*, not the whole pre-drop balance). Deduced payouts show on the chart as a "ghost gem" with an approximate amount, and if Ocean's API ever starts reporting Lightning, the real records take over automatically. If Ocean adds Lightning reporting later, no action needed on your side.

</details>

### What is the "Pre-installation earnings" field for?

It's a manual number added to your "collected" total, for earnings the app couldn't see itself - anything paid out before you installed Hashrate Autopilot (or before the version that started tracking payouts). Put genuinely pre-install sats there.

<details>
<summary>More technical detail</summary>

The app can only deduce payouts from unpaid-balance history it actually recorded, which begins when you first ran a version that tracks it. Payouts before that point are invisible, so this field lets you reconcile them in one lump. One caveat: don't double-count. If the app now auto-deduces your Lightning payouts, this field should hold *only* what predates the app's tracking, not amounts it's already counting. Config → Pool & Payout.

</details>

---

## Bidding & safety

### What do DRY_RUN, LIVE, and PAUSED mean?

- **LIVE** - the autopilot places and edits real bids with real money.
- **DRY_RUN** - it does everything *except* actually place bids, and shows you what it *would* have done. A safe way to watch it for a while before committing.
- **PAUSED** - it stops acting entirely (no new bids, no edits).

<details>
<summary>More technical detail</summary>

DRY_RUN is a genuinely useful first step: run it for a bit, confirm the bids it wants to place look sane, and that hashrate is being delivered and credited on Ocean, then switch to LIVE. It's optional, not required - but it's the cheapest way to sanity-check your setup end to end before spending. The mode switch is on the Status page.

</details>

### What's the difference between "max bid" and "cheap mode"?

**Max bid** is the ceiling: the autopilot never bids above the price you set. **Cheap mode** is the opposite lever - when the market gets cheap, it *raises* your target so you buy more while it's cheap. One caps spending; the other opportunistically increases it.

<details>
<summary>More technical detail</summary>

Each tick the controller finds the cheapest fillable price for your target hashrate, adds your cushion, and bids that - clamped to your max. Cheap mode adds a second, higher hashrate target that engages once the market sits below a threshold for a sustained window, so you scale up during cheap stretches. Because cheap mode makes the autopilot spend *more*, its ceiling is an absolute number you set deliberately rather than a value derived from your base target. Both live under Config → Strategy.

</details>

### Why can't I create or edit a bid?

Braiins requires a Telegram 2FA confirmation on bid **create** and **edit**. If you haven't approved it in Telegram, the action won't go through. Check your Telegram for the approval prompt.

<details>
<summary>More technical detail</summary>

Braiins gates create/edit (not cancel) behind a Telegram confirmation via their official bot. The autopilot surfaces failures from this in its logs and Timeline. Make sure the Braiins Telegram bot is linked to your marketplace account and you're watching the right chat.

</details>

### I deposited to Braiins but still can't bid. Why?

New Braiins deposits go through a compliance screening before the funds are spendable, so there's a delay (typically minutes, occasionally longer) between the deposit confirming and you being able to bid with it. The dashboard shows the deposit as detected first, then available once it clears.

---

## Requirements

### Do I need to run my own Bitcoin node?

For the full picture, yes - the on-chain side of your Profit & Loss (payouts landing in your wallet) is read via a Bitcoin node and an Electrum server (electrs/Fulcrum/ElectrumX). It doesn't have to be a *new* node: if you run Umbrel, its Bitcoin node and Electrs cover this, and you just point the app at them.

<details>
<summary>More technical detail</summary>

The daemon uses electrs (or a Bitcoin RPC) to observe payouts to your address for the "collected (on-chain)" figure and the chart's lifetime-earnings line. On Umbrel this is auto-discovered. In a split setup, point the electrs/RPC URLs at wherever those services run. You do not need to run the node *on the same machine* as the autopilot - it just needs network access to one. Datum Gateway is a separate requirement for the mining path itself (see the topology question).

</details>

### Does the machine need to stay on all the time?

Yes. The autopilot bids, edits, and monitors continuously, so it runs as an always-on service. If it's off, it isn't managing your bids or catching problems. It's designed to be lightweight enough for a small always-on box.

### Community App Store version versus the official Umbrel App Store version - what's the difference?

They're two separate apps with different IDs, so installing the official-store one does **not** carry over data from the community-store one - it starts with an empty database. There's a short one-time migration to bring your history across.

<details>
<summary>More technical detail</summary>

The community-store app id is `rdouma-hashrate-autopilot`; the official Umbrel App Store id is `hashrate-autopilot`. Because Umbrel keys app data by id, the official install is a fresh app with its own empty database. The five-minute migration guide is here: [docs/migrating-from-community-store.md](docs/migrating-from-community-store.md). The two stores can also be on slightly different release cadences - the community store sometimes gets a version first for testing before it's promoted to the official store.

</details>

---

*This FAQ is versioned with the code. Spot something out of date or missing? A PR or an issue is welcome.*
