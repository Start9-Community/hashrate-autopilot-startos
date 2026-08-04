import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk';

export const current = VersionInfo.of({
  version: '1.17.4:0',
  releaseNotes: {
    en_US:
      'Updates Hashrate Autopilot to upstream v1.17.4. Lightning payouts omitted by Ocean are now deduced from confirmed unpaid-earnings drops, partial payout amounts are corrected, and Timeline notes survive Profit & Loss hard resets. Electrum sockets now keep an error handler for their full lifetime, so dropped connections fail cleanly instead of crashing the daemon. Bitaxe values respect the selected number format, the misleading Telegram 2FA bid note is removed, and a user FAQ is included. https://github.com/rdouma/hashrate-autopilot/releases/tag/v1.17.4',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
});
