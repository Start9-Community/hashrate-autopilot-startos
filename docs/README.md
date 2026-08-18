# Documentation Index

This directory contains operator guides, maintainer notes, and upstream reference material for Hashrate Autopilot
for StartOS.

## StartOS Operators

- [`../README.md`](../README.md) - project overview, StartOS sideload flow, and high-level operating notes.
- [`../instructions.md`](../instructions.md) - install-time StartOS instructions shown to operators.
- [`configuration.md`](configuration.md) - configuration fields, environment overrides, and runtime settings.
- [`setup-telegram.md`](setup-telegram.md) - optional Telegram notification setup.

## StartOS Maintainers

- [`../AGENTS.md`](../AGENTS.md) - how the StartOS package is built, released, and what is upstream's versus ours.
- [`../UPDATING.md`](../UPDATING.md) - merging an upstream release into this fork.
- [`architecture.md`](architecture.md) - daemon, dashboard, persistence, deployment, and testing architecture.
- [`spec.md`](spec.md) - bidding model, safety constraints, configuration model, and shipped feature history.

## Upstream References

- [`upstream-install.md`](upstream-install.md) - Docker, bare-metal Node, and SOPS deployment references.
- [`setup-datum-api.md`](setup-datum-api.md) - advanced Umbrel-only Datum API exposure notes.
- [`research.md`](research.md) - historical market, API, Datum, payout, and prior-art research.

For general Docker, bare-metal, or Umbrel application behavior, prefer the upstream project unless you are testing
this StartOS fork directly.
