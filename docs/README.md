# Documentation Index

This directory contains operator guides, maintainer notes, and upstream reference material for Hashrate Autopilot
for StartOS.

## StartOS Operators

- [`../README.md`](../README.md) - project overview, StartOS sideload flow, and high-level operating notes.
- [`../instructions.md`](../instructions.md) - install-time StartOS instructions shown to operators.
- [`configuration.md`](configuration.md) - configuration fields, environment overrides, and runtime settings.
- [`setup-telegram.md`](setup-telegram.md) - optional Telegram notification setup.

## StartOS Maintainers

- [`startos-packaging.md`](startos-packaging.md) - package metadata, manifest, backup, dependency, and build notes.
- [`startos-community-registry-submission.md`](startos-community-registry-submission.md) - preparation status,
  verification evidence, pending device/package gates, and the unsent Community Registry email draft.
- [`architecture.md`](architecture.md) - daemon, dashboard, persistence, deployment, and testing architecture.
- [`spec.md`](spec.md) - bidding model, safety constraints, configuration model, and shipped feature history.

## Upstream References

- [`upstream-install.md`](upstream-install.md) - Docker, bare-metal Node, and SOPS deployment references.
- [`setup-datum-api.md`](setup-datum-api.md) - advanced Umbrel-only Datum API exposure notes.
- [`research.md`](research.md) - historical market, API, Datum, payout, and prior-art research.

For general Docker, bare-metal, or Umbrel application behavior, prefer the upstream project unless you are testing
this StartOS fork directly.
