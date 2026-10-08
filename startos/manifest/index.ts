import { setupManifest } from '@start9labs/start-sdk'

import { long, short } from './i18n'

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
      source: { dockerTag: 'ghcr.io/rdouma/hashrate-autopilot:1.18.2' },
      arch: ['x86_64', 'aarch64'],
      emulateMissing: false,
    },
  },
})
