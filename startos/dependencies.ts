import {
  depBitcoindDescription,
  depDatumDescription,
  depElectrsDescription,
} from './manifest/i18n'
import { sdk } from './sdk'
import { bitcoinVersionRange } from './utils'

export const dependencies = sdk.Dependencies.of()
  // A chain tip that is behind gives wrong block-header answers rather than
  // late ones, so bitcoind must be synced, not merely running.
  .addDependency(
    sdk.Dependency.required('bitcoind', {
      description: depBitcoindDescription,
      metadata: {
        title: 'Bitcoin',
        icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/feec0b1dae42961a257948fe39b40caf8672fce1/dep-icon.svg',
      },
      versionRange: bitcoinVersionRange,
      kind: 'running',
      healthChecks: ['bitcoind', 'sync-progress'],
    }),
  )
  // Payout tracking reads address history, which an unsynced index answers
  // incompletely.
  .addDependency(
    sdk.Dependency.required('electrs', {
      description: depElectrsDescription,
      metadata: {
        title: 'Electrs',
        icon: 'https://raw.githubusercontent.com/Start9Labs/electrs-startos/refs/heads/master/icon.svg',
      },
      versionRange: '>=0.11.1:16',
      kind: 'running',
      healthChecks: ['electrs', 'sync'],
    }),
  )
  // Only the daemon check: Datum's stratum checks describe whether miners are
  // connected, which is exactly what a new operator has not set up yet.
  .addDependency(
    sdk.Dependency.required('datum', {
      description: depDatumDescription,
      metadata: {
        title: 'Datum Gateway',
        icon: 'https://raw.githubusercontent.com/Start9Labs/datum-gateway-startos/refs/heads/master/icon.svg',
      },
      versionRange: '>=0.4.1:15',
      kind: 'running',
      healthChecks: ['datum'],
    }),
  )
