import { setupManifest } from '@start9labs/start-sdk';
import { appVersion } from '../utils';
import {
  depBitcoindDescription,
  depDatumDescription,
  depElectrsDescription,
  long,
  short,
} from './i18n';

export const manifest = setupManifest({
  id: 'hashrate-autopilot',
  title: 'Hashrate Autopilot',
  license: 'MIT',
  packageRepo: 'https://github.com/Start9-Community/hashrate-autopilot-startos',
  upstreamRepo: 'https://github.com/rdouma/hashrate-autopilot',
  marketingUrl: 'https://github.com/rdouma/hashrate-autopilot',
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
      description: depBitcoindDescription,
      optional: false,
      metadata: {
        title: 'Bitcoin',
        icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/refs/heads/31.x/icon.svg',
      },
    },
    electrs: {
      description: depElectrsDescription,
      optional: false,
      metadata: {
        title: 'Electrs',
        icon: 'https://raw.githubusercontent.com/Start9-Community/electrs-startos/refs/heads/master/icon.svg',
      },
    },
    datum: {
      description: depDatumDescription,
      optional: false,
      metadata: {
        title: 'Datum Gateway',
        icon: 'https://raw.githubusercontent.com/Start9Labs/datum-gateway-startos/refs/heads/master/icon.svg',
      },
    },
  },
});
