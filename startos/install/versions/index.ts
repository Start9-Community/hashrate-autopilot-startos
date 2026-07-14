import { VersionInfo } from '@start9labs/start-sdk';

export const v1_10_0_0 = VersionInfo.of({
  version: '1.10.0:0',
  releaseNotes:
    'Initial StartOS package for Hashrate Autopilot v1.10.0. Includes fee protection, configurable edit-price deadband, deadband history in edit tooltips, and chart-marker cap fixes from the upstream release.',
  migrations: {},
});

export const v1_11_0_0 = VersionInfo.of({
  version: '1.11.0:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.11.0. Includes the BIP 110 scanner restructure, Telegram payout-lifecycle alerts, chart color picker, historical network-difficulty backfill, and offline-period reconstruction.',
  migrations: {},
});

export const v1_12_0_0 = VersionInfo.of({
  version: '1.12.0:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.12.0. Includes public-IP change tracking, drag-to-reorder Status cards, configurable marker colors, return-on-spend P&L, Braiins share-rejection metrics, the Bitaxe miner rename, and migrations 0106-0109.',
  migrations: {},
});

export const v1_13_0_0 = VersionInfo.of({
  version: '1.13.0:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.13.0. Includes configurable stats tiles, the dedicated History page, synced chart crosshair, dashboard card handle reordering, BTC oracle and mobile polish, and the pending-cancel race fix. No new upstream migrations.',
  migrations: {},
});

export const v1_14_0_0 = VersionInfo.of({
  version: '1.14.0:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.14.0. Includes run-mode and bid-pause history events, idle-state chart bands, History detail drawer with reason links, legend visibility toggles, speed-edit markers, and migration 0111.',
  migrations: {},
});

export const v1_15_0_0 = VersionInfo.of({
  version: '1.15.0:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.15.0. Includes aviator branding, the bid-vs-hashprice stats tile, BIP-110-aware block explorer defaults, reachable-but-not-hashing Bitaxe detection, stale-bid self-heal, chart-jump beacon fixes, dashboard cache revalidation, and the esbuild security override.',
  migrations: {},
});

export const v1_15_1_0 = VersionInfo.of({
  version: '1.15.1:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.15.1. Includes historically accurate effective-cap charting, BTC payout address validation, P&L refresh fixes, actionable Datum API errors, Electrum connection-help updates, and the upstream dependency and pnpm compatibility updates.',
  migrations: {},
});

export const v1_16_0_0 = VersionInfo.of({
  version: '1.16.0:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.16.0. Includes the Timeline release with unified event history, alert recovery rows, bidirectional chart jumps, denomination-aware Excel export, daemon-start markers, duplicate-bid protection, Datum stratum-probe auto-cancel fixes, and migrations 0114-0115.',
  migrations: {},
});

export const v1_17_1_0 = VersionInfo.of({
  version: '1.17.1:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.17.1. Includes encrypted database-stored secrets, write-only credential handling with config-log scrubbing, dashboard password and Braiins token rotation, Ocean payout-ledger P&L with Lightning payouts, current-block-height stats tile, Timeline notes and search, alert-duration fixes, P&L rebuild and hard-reset controls, DDNS test fixes, dependency updates, refreshed screenshots, and migrations 0116-0119.',
  migrations: {},
});
