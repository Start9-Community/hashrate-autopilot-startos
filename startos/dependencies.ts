import {
  depBitcoindDescription,
  depDatumDescription,
  depElectrsDescription,
} from './manifest/i18n'
import { sdk } from './sdk'

export const dependencies = sdk.Dependencies.of()
  // A chain tip that is behind gives wrong block-header answers rather than
  // late ones, so bitcoind must be synced, not merely running.
  .addDependency(
    sdk.Dependency.required('bitcoind', {
      description: depBitcoindDescription,
      metadata: {
        title: 'Bitcoin',
        icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/refs/heads/31.x/icon.svg',
      },
      versionRange:
        '(>=28.4:29 && <29) || (>=29.4:16 && <30) || (>=30.3:16 && <31) || >=31.1:16 || >=#knotsprerdts:29.3:29',
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
