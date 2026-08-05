import { sdk } from './sdk'
import { buildDependencyEnv } from './dependency-addresses'
import { appVersion, servicePort } from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  const bitcoindRpc = await sdk.host
    .getBridgeAddress(effects, {
      packageId: 'bitcoind',
      hostId: 'rpc',
      internalPort: 8332,
      ssl: false,
    })
    .const()
  const datumApi = await sdk.host
    .getBridgeAddress(effects, {
      packageId: 'datum',
      hostId: 'main',
      internalPort: 7152,
      ssl: false,
    })
    .const()
  const electrs = await sdk.host
    .getBridgeAddress(effects, {
      packageId: 'electrs',
      hostId: 'electrum',
      internalPort: 50001,
      ssl: false,
    })
    .const()

  return sdk.Daemons.of(effects).addDaemon('primary', {
    subcontainer: await sdk.SubContainer.of(
      effects,
      { imageId: 'main' },
      sdk.Mounts.of().mountVolume({
        volumeId: 'main',
        subpath: null,
        mountpoint: '/app/data',
        readonly: false,
      }),
      'hashrate-autopilot-sub',
    ),
    exec: {
      command: ['node', 'packages/daemon/dist/main.js'] as [string, ...string[]],
      env: {
        NODE_ENV: 'production',
        HTTP_HOST: '0.0.0.0',
        HTTP_PORT: String(servicePort),
        DB_PATH: '/app/data/state.db',
        DASHBOARD_STATIC: 'packages/dashboard/dist',
        APP_VERSION: appVersion,
        ...buildDependencyEnv({ bitcoindRpc, datumApi, electrs }),
      },
    },
    ready: {
      display: 'Dashboard',
      fn: () =>
        sdk.healthCheck.checkPortListening(effects, servicePort, {
          successMessage: 'Dashboard is ready',
          errorMessage: 'Dashboard is not responding',
        }),
    },
    requires: [],
  })
})
