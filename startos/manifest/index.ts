import { setupManifest } from '@start9labs/start-sdk';
import { appVersion } from '../utils';
import { short, long } from './i18n';

export const manifest = setupManifest({
  id: 'hashrate-autopilot-9',
  title: 'Hashrate Autopilot for StartOS',
  license: 'MIT',
  packageRepo: 'https://github.com/mdubore/hashrate9',
  upstreamRepo: 'https://github.com/rdouma/hashrate-autopilot',
  marketingUrl: 'https://github.com/mdubore/hashrate9',
  donationUrl: null,
  docsUrls: [
    'https://github.com/mdubore/hashrate9',
    'https://github.com/mdubore/hashrate9/blob/main/docs/configuration.md',
  ],
  description: { short, long },
  volumes: ['main'],
  images: {
    main: {
      source: {
        dockerBuild: {
          dockerfile: './Dockerfile.startos',
          workdir: '.',
          buildArgs: {
            APP_VERSION: appVersion,
          },
        },
      },
      arch: ['x86_64', 'aarch64'],
    },
  },
  alerts: {
    install:
      'Hashrate Autopilot can place and edit live Braiins marketplace bids after you enable LIVE mode. Complete setup in DRY-RUN first and verify your pool destination before enabling LIVE mode.',
    update: null,
    uninstall:
      'Uninstalling deletes the StartOS data volume, including configuration, secrets, tick history, bid history, and alerts.',
    restore: null,
    start: null,
    stop: null,
  },
  dependencies: {
    bitcoind: {
      description:
        'Provides the local Bitcoin node used by Datum Gateway and optional BIP 110 block-header checks.',
      optional: false,
      s9pk: null,
    },
    electrs: {
      description:
        'Provides Electrum lookups for Ocean payout tracking and historical payout backfill.',
      optional: false,
      s9pk: null,
    },
    datum: {
      description:
        'Receives rented hashrate from Braiins and exposes Datum Gateway statistics for the dashboard.',
      optional: false,
      s9pk: null,
    },
  },
});
