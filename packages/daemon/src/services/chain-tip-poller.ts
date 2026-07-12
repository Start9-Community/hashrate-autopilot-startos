/**
 * #335: polls bitcoind for the Bitcoin chain tip and caches whether the
 * tip block was found by Ocean and whether it signals BIP-110, for the
 * "block height" dashboard tile.
 *
 * getblockchaininfo is cheap and runs every interval; the full tip block
 * (needed for the coinbase pool tag and header version) is only re-fetched
 * when the height actually changes, so a steady chain costs one RPC call
 * per interval. Only constructed when bitcoind RPC is configured - without
 * a node the tile is hidden, so there's nothing to poll.
 */

import type { BitcoindClient } from '@hashrate-autopilot/bitcoind-client';

import { extractCoinbaseTags, isBip110Signal } from '../http/routes/bip110-scan.js';

export interface ChainTipSnapshot {
  readonly height: number;
  readonly foundByOcean: boolean;
  readonly signalsBip110: boolean;
  readonly fetchedAtMs: number;
}

interface BlockVerbosity1 {
  readonly tx: readonly string[];
}
interface RawCoinbaseTx {
  readonly vin: readonly { readonly coinbase?: string }[];
}

export class ChainTipPoller {
  private snapshot: ChainTipSnapshot | null = null;
  private lastHeight = -1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private readonly intervalMs: number;
  private readonly log: (msg: string) => void;
  private readonly now: () => number;

  constructor(
    private readonly client: BitcoindClient,
    opts: { intervalMs?: number; log?: (m: string) => void; now?: () => number } = {},
  ) {
    this.intervalMs = opts.intervalMs ?? 60_000;
    this.log = opts.log ?? (() => {});
    this.now = opts.now ?? ((): number => Date.now());
  }

  start(): void {
    if (this.timer) return;
    // Prime once so the tile isn't blank for a full interval after boot.
    void this.runOnce();
    this.timer = setInterval(() => {
      if (this.inFlight) return;
      this.inFlight = true;
      this.runOnce().finally(() => {
        this.inFlight = false;
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSnapshot(): ChainTipSnapshot | null {
    return this.snapshot;
  }

  async runOnce(): Promise<void> {
    try {
      const info = await this.client.getBlockchainInfo();
      const height = info.blocks;
      // Same tip as last poll: keep the cached Ocean/BIP-110 verdict.
      if (height === this.lastHeight && this.snapshot) return;

      const hash = info.bestblockhash;
      const header = await this.client.getBlockHeader(hash);
      const signalsBip110 = isBip110Signal(header.version);

      let foundByOcean = false;
      try {
        const [block] = await this.client.batch<BlockVerbosity1>([
          { method: 'getblock', params: [hash, 1] },
        ]);
        const cbTxid = block?.tx[0];
        if (cbTxid) {
          const [tx] = await this.client.batch<RawCoinbaseTx>([
            { method: 'getrawtransaction', params: [cbTxid, true, hash] },
          ]);
          const scriptSig = tx?.vin[0]?.coinbase;
          if (scriptSig) foundByOcean = extractCoinbaseTags(scriptSig).pool === 'Ocean';
        }
      } catch {
        // Coinbase enrichment is best-effort; height + BIP-110 still cache.
      }

      this.snapshot = { height, foundByOcean, signalsBip110, fetchedAtMs: this.now() };
      this.lastHeight = height;
    } catch (err) {
      this.log(`[chain-tip] poll failed: ${(err as Error).message}`);
    }
  }
}
