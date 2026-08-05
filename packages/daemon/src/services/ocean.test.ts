import { describe, expect, it } from 'vitest';

import { createOceanClient, parseOceanTs } from './ocean.js';

// Fixtures matching the real api.ocean.xyz/v1/ JSON responses
// captured 2026-04-16.

const STATSNAP = {
  result: {
    unpaid: '0.00385090',
    estimated_earn_next_block: '0.00028745',
    estimated_total_earn_next_block: '0.00028745',
    shares_in_tides: '103027310592',
  },
};

const USER_HASHRATE = {
  result: {
    hashrate_10800s: '1849290596989010',
    active_worker_count: 1,
  },
};

const POOL_STAT = {
  result: {
    network_difficulty: '138966872071213.02',
    current_tides_shares: '1111734976569704',
    current_estimated_block_reward: '3.13312160',
  },
};

function fakeApiFetch(overrides: Record<string, unknown> = {}): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    let body: unknown;
    if (u.includes('/statsnap/')) body = overrides['statsnap'] ?? STATSNAP;
    else if (u.includes('/user_hashrate/')) body = overrides['hashrate'] ?? USER_HASHRATE;
    else if (u.includes('/pool_stat')) body = overrides['pool'] ?? POOL_STAT;
    else return { ok: false, status: 404, json: async () => ({}) } as Response;
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

describe('OceanClient (JSON API)', () => {
  it('parses unpaid earnings from statsnap', async () => {
    const client = createOceanClient({ fetch: fakeApiFetch() });
    const stats = await client.fetchStats('bc1qaddress');
    expect(stats).not.toBeNull();
    expect(stats!.unpaid_sat).toBe(385_090);
  });

  it('parses estimated next-block earnings', async () => {
    const client = createOceanClient({ fetch: fakeApiFetch() });
    const stats = await client.fetchStats('bc1qaddress');
    expect(stats!.next_block_sat).toBe(28_745);
  });

  it('computes share log percentage from user + pool shares', async () => {
    const client = createOceanClient({ fetch: fakeApiFetch() });
    const stats = await client.fetchStats('bc1qaddress');
    expect(stats!.share_log_pct).toBeGreaterThan(0);
    expect(stats!.share_log_pct).toBeLessThan(1);
  });

  it('computes daily estimate from hashrate + network difficulty', async () => {
    const client = createOceanClient({ fetch: fakeApiFetch() });
    const stats = await client.fetchStats('bc1qaddress');
    expect(stats!.daily_estimate_sat).toBeGreaterThan(0);
  });

  it('computes time-to-payout from unpaid + daily rate', async () => {
    const client = createOceanClient({ fetch: fakeApiFetch() });
    const stats = await client.fetchStats('bc1qaddress');
    expect(stats!.time_to_payout_text).toMatch(/^\d+ (days|hours)$/);
  });

  it('returns null on HTTP failure', async () => {
    const client = createOceanClient({
      fetch: (async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    });
    expect(await client.fetchStats('bc1qaddress')).toBeNull();
  });

  it('caches results within the TTL', async () => {
    let calls = 0;
    const client = createOceanClient({
      fetch: (async (url: string) => {
        calls++;
        const f = fakeApiFetch();
        return f(url, {} as RequestInit);
      }) as unknown as typeof fetch,
      cacheTtlMs: 60_000,
      now: () => 1_700_000_000_000,
    });
    await client.fetchStats('bc1qaddress');
    const callsAfterFirst = calls;
    await client.fetchStats('bc1qaddress');
    expect(calls).toBe(callsAfterFirst);
  });

  it('lifetime_sat is null (not available via JSON API)', async () => {
    const client = createOceanClient({ fetch: fakeApiFetch() });
    const stats = await client.fetchStats('bc1qaddress');
    expect(stats!.lifetime_sat).toBeNull();
  });

  it('reports payout threshold', async () => {
    const client = createOceanClient({ fetch: fakeApiFetch() });
    const stats = await client.fetchStats('bc1qaddress');
    expect(stats!.payout_threshold_sat).toBe(1_048_576);
  });
});

describe('parseOceanTs', () => {
  it('treats bare ISO datetime as UTC (not local)', () => {
    // Regression: /v1/blocks returns ts without a timezone suffix.
    // new Date(str) interprets that as local time, making the "found X
    // ago" display drift by the host's UTC offset - sometimes enough
    // that a later block appeared older than an earlier one.
    const ms = parseOceanTs('2026-04-18T10:54:28.021400');
    expect(new Date(ms).toISOString()).toBe('2026-04-18T10:54:28.021Z');
  });

  it('preserves explicit Z suffix', () => {
    const ms = parseOceanTs('2026-04-18T10:54:28.021Z');
    expect(new Date(ms).toISOString()).toBe('2026-04-18T10:54:28.021Z');
  });

  it('preserves explicit offset', () => {
    const ms = parseOceanTs('2026-04-18T12:54:28.021+02:00');
    expect(new Date(ms).toISOString()).toBe('2026-04-18T10:54:28.021Z');
  });

  it('returns 0 for empty or unparseable input', () => {
    expect(parseOceanTs('')).toBe(0);
    expect(parseOceanTs(null)).toBe(0);
    expect(parseOceanTs(undefined)).toBe(0);
    expect(parseOceanTs('not a date')).toBe(0);
  });

  it('preserves monotonic height→time ordering on real fixtures', () => {
    // Captured from api.ocean.xyz/v1/blocks 2026-04-19. With the old
    // local-TZ parser these two could invert depending on host TZ.
    const a = parseOceanTs('2026-04-18T10:54:28.021400'); // height 945606
    const b = parseOceanTs('2026-04-17T11:05:47.630700'); // height 945475
    expect(a).toBeGreaterThan(b);
  });
});

// #323: earnpay payout parsing. Shape captured 2026-07-04 against the
// operator's address: result.payouts[] with ts, on_chain_txid (null =
// Lightning), total_satoshis_net_paid (already in sats), is_generation_txn.
const EARNPAY = {
  result: {
    payouts: [
      {
        ts: '2026-05-25T14:02:11.000000',
        on_chain_txid: '784542e9e148c481c66e33528e5b7628cb1585b87389d3a771fb77154e8dcc85',
        total_satoshis_net_paid: 1_115_700,
        is_generation_txn: false,
      },
      // Lightning payout: no txid, off-chain. The whole reason for #323.
      {
        ts: '2026-06-01T09:15:00.000000',
        on_chain_txid: null,
        total_satoshis_net_paid: 65_536,
        is_generation_txn: false,
      },
    ],
  },
};

function fakeEarnpayFetch(body: unknown = EARNPAY): typeof fetch {
  return (async (url: string) => {
    if (!String(url).includes('/earnpay/')) {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

describe('OceanClient.fetchPayouts (#323)', () => {
  it('parses on-chain and Lightning payouts, deriving rail from txid presence', async () => {
    const client = createOceanClient({ fetch: fakeEarnpayFetch() });
    const payouts = await client.fetchPayouts('bc1qaddr', '2020-01-01', '2026-07-06');
    expect(payouts).not.toBeNull();
    expect(payouts).toHaveLength(2);

    const onchain = payouts![0]!;
    expect(onchain.on_chain_txid).toMatch(/^784542e9/);
    expect(onchain.net_sat).toBe(1_115_700);
    expect(onchain.is_generation).toBe(false);

    const lightning = payouts![1]!;
    expect(lightning.on_chain_txid).toBeNull();
    expect(lightning.net_sat).toBe(65_536);
  });

  it('drops malformed rows (zero amount / unparseable ts)', async () => {
    const body = {
      result: {
        payouts: [
          { ts: '2026-06-01T00:00:00', on_chain_txid: null, total_satoshis_net_paid: 0, is_generation_txn: false },
          { ts: '', on_chain_txid: 'x', total_satoshis_net_paid: 500, is_generation_txn: false },
          { ts: '2026-06-02T00:00:00', on_chain_txid: 'ok', total_satoshis_net_paid: 700, is_generation_txn: false },
        ],
      },
    };
    const client = createOceanClient({ fetch: fakeEarnpayFetch(body) });
    const payouts = await client.fetchPayouts('bc1qaddr', '2020-01-01', '2026-07-06');
    expect(payouts).toHaveLength(1);
    expect(payouts![0]!.net_sat).toBe(700);
  });

  it('returns [] when payouts is missing, null on HTTP failure', async () => {
    const emptyClient = createOceanClient({ fetch: fakeEarnpayFetch({ result: {} }) });
    expect(await emptyClient.fetchPayouts('bc1qaddr', '2020-01-01', '2026-07-06')).toEqual([]);

    const failFetch = (async () =>
      ({ ok: false, status: 500, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    const failClient = createOceanClient({ fetch: failFetch });
    expect(await failClient.fetchPayouts('bc1qaddr', '2020-01-01', '2026-07-06')).toBeNull();
  });
});
