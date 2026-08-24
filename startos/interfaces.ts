import { i18n } from './i18n';
import { sdk } from './sdk';
import { servicePort } from './utils';

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const uiMulti = sdk.MultiHost.of(effects, 'ui');
  const uiOrigin = await uiMulti.bindPort(servicePort, { protocol: 'http' });

  const ui = sdk.createInterface(effects, {
    name: i18n('Dashboard'),
    id: 'ui',
    description: i18n('The Hashrate Autopilot dashboard, setup wizard and API'),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  });

  return [await uiOrigin.export([ui])];
});
