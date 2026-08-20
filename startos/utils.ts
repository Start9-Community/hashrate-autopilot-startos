/** The dashboard, setup wizard and API all share one listener. */
export const servicePort = 3010;

/**
 * The packaged upstream application version. `scripts/build-release-inputs.sh`
 * parses this line, and the manifest passes it to the image build as
 * `APP_VERSION`, so keep the shape `appVersion = '<x.y.z>'`.
 */
export const appVersion = '1.18.0';

/** Where bitcoind's data directory is mounted, read-only, for its RPC cookie. */
export const bitcoinMountpoint = '/mnt/bitcoin';
