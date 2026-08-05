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
