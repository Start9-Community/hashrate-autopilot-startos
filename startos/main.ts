import { FileHelper } from '@start9labs/start-sdk';
import { manifest as bitcoinManifest } from 'bitcoin-core-startos/startos/manifest';
import {
  rpcHostId as bitcoindRpcHostId,
  rpcPort as bitcoindRpcPort,
} from 'bitcoin-core-startos/startos/utils';
import { uiHostId as datumHostId, uiPort as datumPort } from 'datum-gateway-startos/startos/utils';
import { electrumHostId, port as electrumPort } from 'electrs-startos/startos/utils';
import { buildDependencyEnv } from './dependency-addresses';
import { i18n } from './i18n';
import { sdk } from './sdk';
import { bitcoinMountpoint, servicePort } from './utils';

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Hashrate Autopilot'));

  // Every dependency is required, so an unresolved address is a hard failure
  // rather than an omitted variable: the daemon would otherwise start and
  // silently report no chain tip, no payouts and no pool statistics.
  const bitcoindRpc = await sdk.host
    .getBridgeAddress(effects, {
      packageId: 'bitcoind',
      hostId: bitcoindRpcHostId,
      internalPort: bitcoindRpcPort,
      ssl: false,
    })
    .const();
  if (!bitcoindRpc) {
    throw new Error(
      i18n(
        'Bitcoin is not reachable on the internal network. Make sure Bitcoin is installed and running.',
      ),
    );
  }

  const datumApi = await sdk.host
    .getBridgeAddress(effects, {
      packageId: 'datum',
      hostId: datumHostId,
      internalPort: datumPort,
      ssl: false,
    })
    .const();
  if (!datumApi) {
    throw new Error(
      i18n(
        'Datum Gateway is not reachable on the internal network. Make sure Datum Gateway is installed and running.',
      ),
    );
  }

  const electrs = await sdk.host
    .getBridgeAddress(effects, {
      packageId: 'electrs',
      hostId: electrumHostId,
      internalPort: electrumPort,
      ssl: false,
    })
    .const();
  if (!electrs) {
    throw new Error(
      i18n(
        'Electrs is not reachable on the internal network. Make sure Electrs is installed and running.',
      ),
    );
  }

  const sub = await sdk.SubContainer.eager(
    effects,
    { imageId: 'main' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'main',
        subpath: null,
        mountpoint: '/app/data',
        readonly: false,
      })
      .mountDependency<typeof bitcoinManifest>({
        dependencyId: 'bitcoind',
        volumeId: 'main',
        subpath: null,
        mountpoint: bitcoinMountpoint,
        readonly: true,
      }),
    'hashrate-autopilot-sub',
  );

  // bitcoind's RPC auth, read off its own volume rather than asked of the
  // operator. The cookie is `__cookie__:<secret>` and is rewritten on every
  // bitcoind start, so the read is reactive — a rotated cookie restarts the
  // daemon with the new one, and an absent cookie means bitcoind is down.
  const cookie = await FileHelper.string(`${sub.rootfs}${bitcoinMountpoint}/.cookie`)
    .read(
      (c) => c,
      (prev, next) => next === null || prev === next,
    )
    .const(effects);
  const separator = cookie?.indexOf(':') ?? -1;
  if (!cookie || separator < 0) {
    throw new Error(
      i18n(
        "Bitcoin's RPC cookie could not be read. Start Bitcoin and wait for it to come up, then start Hashrate Autopilot again.",
      ),
    );
  }

  // Setup is one-way, so stop polling the container once it is done.
  let setupDone = false

  return sdk.Daemons.of(effects).addDaemon('primary', {
    subcontainer: sub,
    exec: {
      command: ['node', 'packages/daemon/dist/main.js'],
      env: {
        BHA_BITCOIND_RPC_USER: cookie.slice(0, separator),
        BHA_BITCOIND_RPC_PASSWORD: cookie.slice(separator + 1).trim(),
        ...buildDependencyEnv({ bitcoindRpc, datumApi, electrs }),
      },
    },
    ready: {
      display: i18n('Dashboard'),
      fn: () =>
        sdk.healthCheck.checkPortListening(effects, servicePort, {
          successMessage: i18n('The dashboard is ready'),
          errorMessage: i18n('The dashboard is not responding'),
        }),
    },
    requires: [],
  }).addHealthCheck('setup', {
    ready: {
      display: i18n('Setup'),
      fn: async () => {
        if (setupDone) {
          return { message: i18n('Setup is complete'), result: 'success' }
        }
        // The wizard is unauthenticated by design, and POST /api/setup chooses
        // the dashboard password — so NEEDS_SETUP is a window in which anyone
        // who can reach this address can claim the instance.
        const res = await sub.exec(
          [
            'node',
            '-e',
            `fetch('http://127.0.0.1:${servicePort}/api/health').then(r=>r.json()).then(j=>console.log(j.mode))`,
          ],
          {},
          15_000,
        )
        const mode = String(res.stdout ?? '').trim()
        if (mode === '') {
          return { message: i18n('Checking setup state…'), result: 'starting' }
        }
        if (mode === 'NEEDS_SETUP') {
          return {
            message: i18n(
              'Setup is not finished. Until you complete the wizard, anyone who can reach this address can claim this instance and set its password. Open the dashboard and finish setup now.',
            ),
            result: 'failure',
          }
        }
        setupDone = true
        return { message: i18n('Setup is complete'), result: 'success' }
      },
    },
    requires: ['primary'],
  });
});
