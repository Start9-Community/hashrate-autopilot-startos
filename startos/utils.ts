/** The dashboard, setup wizard and API all share one listener. */
export const servicePort = 3010

/** Where bitcoind's public volume is mounted, read-only, for its RPC cookie. */
export const bitcoinMountpoint = '/mnt/bitcoin'

/** First revisions on each supported Bitcoin line that expose public/.cookie. */
export const bitcoinVersionRange =
  '(>=28.4:42 && <29) || (>=29.5:4 && <30) || (>=30.4:4 && <31) || >=31.2:4 || >=#knotsprerdts:29.3:33 || >=#roots:29.4:1'
