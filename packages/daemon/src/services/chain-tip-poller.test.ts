import { describe, expect, it } from 'vitest';

import type { BitcoindClient } from '@hashrate-autopilot/bitcoind-client';

import { ChainTipPoller } from './chain-tip-poller.js';

/** Coinbase scriptSig hex whose printable run carries the given tag. */
function coinbaseHex(tag: string): string {
  return Buffer.concat([
    Buffer.from([0x03, 0x01, 0x02, 0x03]), // height push + junk
    Buffer.from(tag, 'ascii'),
    Buffer.from([0x00, 0x00]),
  ]).toString('hex');
}

// A BIP-110 signaling version: top 3 bits = 001 and bit 4 set.
const SIGNAL_VERSION = 0x2000_0010;
// A plain version-bits block that does NOT signal (bit 4 clear).
const NON_SIGNAL_VERSION = 0x2000_0000;

interface FakeOpts {
  height: number;
  hash: string;
  version: number;
  coinbaseTag: string;
}

function makeClient(opts: FakeOpts) {
  const calls = { blockchainInfo: 0, header: 0, batch: 0 };
  const client = {
    async getBlockchainInfo() {
      calls.blockchainInfo += 1;
      return { chain: 'main', blocks: opts.height, headers: opts.height, bestblockhash: opts.hash, verificationprogress: 1, pruned: false };
    },
    async getBlockHeader(_hash: string) {
      calls.header += 1;
      return { version: opts.version } as never;
    },
    async batch<T>(reqs: readonly { method: string; params: unknown[] }[]): Promise<T[]> {
      calls.batch += 1;
      const method = reqs[0]!.method;
      if (method === 'getblock') return [{ tx: ['cb-txid'] }] as unknown as T[];
      if (method === 'getrawtransaction') {
        return [{ vin: [{ coinbase: coinbaseHex(opts.coinbaseTag) }] }] as unknown as T[];
      }
      throw new Error(`unexpected batch method ${method}`);
    },
  } as unknown as BitcoindClient;
  return { client, calls };
}

describe('ChainTipPoller (#335)', () => {
  it('detects an Ocean tip that signals BIP-110', async () => {
    const { client } = makeClient({ height: 957_329, hash: 'aa', version: SIGNAL_VERSION, coinbaseTag: '<OCEAN.XYZ> Roughnecks' });
    const poller = new ChainTipPoller(client, { now: () => 1000 });
    await poller.runOnce();
    expect(poller.getSnapshot()).toEqual({
      height: 957_329,
      foundByOcean: true,
      signalsBip110: true,
      fetchedAtMs: 1000,
    });
  });

  it('flags a non-Ocean, non-signaling tip', async () => {
    const { client } = makeClient({ height: 957_330, hash: 'bb', version: NON_SIGNAL_VERSION, coinbaseTag: 'Foundry USA Pool' });
    const poller = new ChainTipPoller(client, { now: () => 2000 });
    await poller.runOnce();
    const snap = poller.getSnapshot()!;
    expect(snap.foundByOcean).toBe(false);
    expect(snap.signalsBip110).toBe(false);
    expect(snap.height).toBe(957_330);
  });

  it('reuses the cached verdict while the height is unchanged (one block fetch per new tip)', async () => {
    const { client, calls } = makeClient({ height: 957_331, hash: 'cc', version: SIGNAL_VERSION, coinbaseTag: '<OCEAN.XYZ>' });
    const poller = new ChainTipPoller(client, { now: () => 3000 });
    await poller.runOnce();
    await poller.runOnce();
    await poller.runOnce();
    // getblockchaininfo runs every poll, but the header + coinbase batches
    // only fire on the first (height didn't change afterwards).
    expect(calls.blockchainInfo).toBe(3);
    expect(calls.header).toBe(1);
    expect(calls.batch).toBe(2); // getblock + getrawtransaction, once
  });

  it('degrades gracefully when a poll throws (keeps the last snapshot)', async () => {
    let boom = false;
    const client = {
      async getBlockchainInfo() {
        if (boom) throw new Error('node offline');
        return { chain: 'main', blocks: 5, headers: 5, bestblockhash: 'dd', verificationprogress: 1, pruned: false };
      },
      async getBlockHeader() {
        return { version: SIGNAL_VERSION } as never;
      },
      async batch() {
        return [{ tx: ['t'] }, { vin: [{ coinbase: coinbaseHex('x') }] }] as never;
      },
    } as unknown as BitcoindClient;
    const poller = new ChainTipPoller(client, { now: () => 4000 });
    await poller.runOnce();
    const first = poller.getSnapshot();
    expect(first?.height).toBe(5);
    boom = true;
    await poller.runOnce(); // throws internally, swallowed
    expect(poller.getSnapshot()).toBe(first); // unchanged, no crash
  });
});
