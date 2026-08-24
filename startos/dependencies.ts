import { sdk } from './sdk';

export const setDependencies = sdk.setupDependencies(async () => ({
  // A chain tip that is behind gives wrong block-header answers rather than
  // late ones, so bitcoind must be synced, not merely running.
  bitcoind: {
    kind: 'running' as const,
    versionRange: '>=28.4:14',
    healthChecks: ['bitcoind', 'sync-progress'],
  },
  // Payout tracking reads address history, which an unsynced index answers
  // incompletely.
  electrs: {
    kind: 'running' as const,
    versionRange: '>=0.11.1:16',
    healthChecks: ['electrs', 'sync'],
  },
  // Only the daemon check: Datum's stratum checks describe whether miners are
  // connected, which is exactly what a new operator has not set up yet.
  datum: {
    kind: 'running' as const,
    versionRange: '>=0.4.1:15',
    healthChecks: ['datum'],
  },
}));
