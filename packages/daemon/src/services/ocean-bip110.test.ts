import { describe, expect, it } from 'vitest';

import {
  createBip110OceanClient,
  createChainAwareOceanClient,
  parseBlockRows,
  parseBtcLabel,
  parseHashrate,
  parsePayoutRows,
  parseSuffixedNumber,
  parseTotalRowHashrates,
  subsidySatForHeight,
} from './ocean-bip110.js';

// Fixtures trimmed from real bip110.ocean.xyz responses captured
// 2026-08-17. The label/value markup ("blocks-label" + bare value
// <span>) is unchanged from the pre-#9 ocean.xyz scraper era.

const PAYOUTCARDS = `
<div class="blocks dashboard-container">
  <div class="blocks-label">Unpaid Earnings
<div class="tooltip tooltip-info">
    <span class="tooltiptext">Earnings below threshold pending payment</span>
</div>
  </div>
      <span>0.18939196 BTC</span>
  <div class="blocks-label">Estimated Payout Next Block
<div class="tooltip tooltip-info">
    <span class="tooltiptext">Estimated payout if a block is found right now</span>
</div>
  </div>
      <span>0.53138625 BTC</span>
  <div class="blocks-label">Estimated Time Until Minimum Payout
<div class="tooltip tooltip-info">
    <span class="tooltiptext">Time at 3-hour hashrate until earnings exceed payout threshold (0.01048576 BTC)</span>
</div>
  </div>
      <span>Next block</span>
</div>`;

const LIFETIMECARDS = `
<div class="blocks-label">Share Log %</div><span>11.05%</span>
<div class="blocks-label">Estimated Earnings Per Day
<div class="tooltip tooltip-info"><span class="tooltiptext">Estimated earnings per day, not including share of transaction fees, at your 3-hour hashrate</span></div>
</div><span>0.35037334 BTC</span>
<div class="blocks-label">Lifetime Earnings</div><span>5.33677721 BTC</span>`;

const EARNINGSCARDS = `
<div class="blocks-label">Shares In Reward Window</div><span>112.74T</span>
<div class="blocks-label">Estimated Rewards In Window
<div class="tooltip tooltip-info"><span class="tooltiptext">Estimated earnings for all your shares currently in the share log, not including share of transaction fees</span></div>
</div><span>2.76359019 BTC</span>
<div class="blocks-label">Estimated Earnings Next Block
<div class="tooltip tooltip-info"><span class="tooltiptext">Estimated earnings if a block is found right now, including share of transaction fees</span></div>
</div><span>0.34199428 BTC</span>`;

const WORKERS_ROWS = `
  <tr class="table-row">
        <td class="table-cell" class="hide-overflow">
          <a href="/stats/bc1qtestaddress">Total </a>
        </td>
        <td class="table-cell">
          <div class="status-online-text">Online</div>
        </td>
        <td class="table-cell date-text" ><div class="date-text">2026-08-17 08:28</div></td>
          <td class="table-cell" >150.1 Th/s</td>
          <td class="table-cell" >710.5 Ph/s</td>
  </tr>
  <tr class="table-row">
        <td class="table-cell" class="hide-overflow">
          <a href="/stats/bc1qtestaddress.default">default </a>
        </td>
        <td class="table-cell">
          <div class="status-online-text">Online</div>
        </td>
        <td class="table-cell date-text" ><div class="date-text">2026-08-17 08:28</div></td>
          <td class="table-cell" >150.1 Th/s</td>
          <td class="table-cell" >710.5 Ph/s</td>
  </tr>`;

const POOLSTATUS = `
<a id="pool-status" class="undecorated new-header" href="/dashboard">
    <div class="status-indicator status-online"></div>
    <p id="pool-status-item" class="hide-500">
        HASHRATE:  86.28 Ph/s  <span class="hide-500">&bull;</span> <span class="hide-500 pool-status-newline">LAST BLOCK: 961635 (4D AGO)</span>
    </p>
</a>`;

const DASHBOARD_BLOCK_ROW = `
<table id="blocks-fulltable">
  <tr class="table-row">
        <td class="table-cell date-text" ><div class="date-text">2026-08-12 09:19</div></td>
        <td class="table-cell">22.94T</td>
        <td class="table-cell" >127.48T </td>
          <td class="table-cell" style="text-align: left;">
            <div class="inner-table-cell">
              <span class="tooltip-worker">
                <img class="leading-icon" src="/static/assets/datum_icon.svg"></img>
                <span class="tooltiptext-worker">This block was solo mined</span>
              </span>
            <a href="/stats/bc1qya76dgjcddhq02rzmfvdcdvv344y47l8fdf5lp" class="tooltip-worker worker-link">
                Roughnecks
              <span class="tooltiptext-worker">
                  User: bc1qya76dgjcddhq02rzmfvdcdvv344y47l8fdf5lp <br/>
                Worker: default
              </span>
            </a>
            </div>
          </td>
        <td class="table-cell">961635</td>
        <td class="table-cell blockhash-text" style="max-width: 100px; width: 20px;">
          <a href="/info/block/00000000000000000000c705b7a0a847d2713d73da4a1b20cea3dfdd617fa651" class="blockhash-link">00000000000000000000c705b7a0a847d2713d73da4a1b20cea3dfdd617fa651</a>
        </td>
  </tr>
</table>`;

const PAYOUT_ROWS = `
  <tr class="table-row">
        <td class="table-cell date-text" ><div class="date-text">2026-08-12 12:17</div></td>
          <td class="table-cell" style="text-align: start;">
            <a href="/info/tx/905983eb3ed135fa3c92e35966a73f0547d3631b97eb6c095381c463314a9238">⛏️ 905983eb3ed135fa3c92e35966a73f0547d3631b97eb6c095381c463314a9238</a>
          </td>
            <td class="table-cell" >0.21899745 BTC</td>
  </tr>
  <tr class="table-row">
        <td class="table-cell date-text" ><div class="date-text">2026-08-08 21:49</div></td>
          <td class="table-cell" style="text-align: start;">
            <a href="/info/tx/ffe35324dbf516f058ae6c5d25fdc2fa25bc1b01a365af315ea3347f6757420a">⛏️ ffe35324dbf516f058ae6c5d25fdc2fa25bc1b01a365af315ea3347f6757420a</a>
          </td>
            <td class="table-cell" >0.16597114 BTC</td>
  </tr>`;

function fakeSiteFetch(): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    let body: string;
    if (u.includes('/payoutcards')) body = PAYOUTCARDS;
    else if (u.includes('/lifetimecards')) body = LIFETIMECARDS;
    else if (u.includes('/earningscards')) body = EARNINGSCARDS;
    else if (u.includes('/payouts/rows')) {
      // One page of settlements, then empty (the pager stops on []).
      body = u.includes('ppage=1') ? PAYOUT_ROWS : '';
    } else if (u.includes('/workers/rows')) body = WORKERS_ROWS;
    else if (u.includes('/poolstatus')) body = POOLSTATUS;
    else if (u.includes('/dashboard')) {
      body = u.includes('bpage=') && !u.includes('bpage=1') ? '' : DASHBOARD_BLOCK_ROW;
    } else return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    return { ok: true, status: 200, text: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('parse helpers', () => {
  it('parses BTC labels around nested tooltips', () => {
    expect(parseBtcLabel(PAYOUTCARDS, 'Unpaid Earnings')).toBe(18_939_196);
    expect(parseBtcLabel(LIFETIMECARDS, 'Lifetime Earnings')).toBe(533_677_721);
  });

  it('does not leak the tooltip text into raw span values', () => {
    // The tooltip span precedes the value span; a lax pattern used to
    // render Ocean's hover help instead of "Next block".
    expect(
      parseBtcLabel(EARNINGSCARDS, 'Estimated Rewards In Window'),
    ).toBe(276_359_019);
  });

  it('parses hashrates with magnitude suffixes', () => {
    expect(parseHashrate('150.1 Th/s')).toBeCloseTo(150.1e12);
    expect(parseHashrate('86.28 Ph/s')).toBeCloseTo(86.28e15);
    expect(parseHashrate(null)).toBeNull();
  });

  it('parses difficulty shorthand', () => {
    expect(parseSuffixedNumber('127.48T')).toBeCloseTo(127.48e12);
  });

  it('extracts the Total row hashrates (60s + 3hr columns)', () => {
    const { h60s_hs, h3h_hs } = parseTotalRowHashrates(WORKERS_ROWS);
    expect(h60s_hs).toBeCloseTo(150.1e12);
    expect(h3h_hs).toBeCloseTo(710.5e15);
  });

  it('computes subsidy by halving schedule', () => {
    expect(subsidySatForHeight(0)).toBe(5_000_000_000);
    expect(subsidySatForHeight(961_635)).toBe(312_500_000);
  });

  it('parses dashboard block rows', () => {
    const blocks = parseBlockRows(DASHBOARD_BLOCK_ROW);
    expect(blocks).toHaveLength(1);
    const b = blocks[0]!;
    expect(b.height).toBe(961_635);
    expect(b.block_hash).toBe(
      '00000000000000000000c705b7a0a847d2713d73da4a1b20cea3dfdd617fa651',
    );
    expect(b.username).toBe('bc1qya76dgjcddhq02rzmfvdcdvv344y47l8fdf5lp');
    expect(b.worker).toBe('default');
    expect(b.subsidy_sat).toBe(312_500_000);
    expect(b.network_difficulty).toBeCloseTo(127.48e12);
    expect(b.timestamp_ms).toBe(Date.parse('2026-08-12T09:19:00Z'));
  });

  it('parses payout rows', () => {
    const payouts = parsePayoutRows(PAYOUT_ROWS);
    expect(payouts).toHaveLength(2);
    expect(payouts[0]!.net_sat).toBe(21_899_745);
    expect(payouts[0]!.on_chain_txid).toBe(
      '905983eb3ed135fa3c92e35966a73f0547d3631b97eb6c095381c463314a9238',
    );
    expect(payouts[0]!.is_generation).toBe(false);
    expect(payouts[1]!.ts_ms).toBe(Date.parse('2026-08-08T21:49:00Z'));
  });
});

describe('createBip110OceanClient', () => {
  it('assembles OceanStats from the scraped fragments', async () => {
    const client = createBip110OceanClient({ fetch: fakeSiteFetch(), now: () => 1000 });
    const stats = await client.fetchStats('bc1qtestaddress');
    expect(stats).not.toBeNull();
    expect(stats!.unpaid_sat).toBe(18_939_196);
    expect(stats!.lifetime_sat).toBe(533_677_721);
    expect(stats!.daily_estimate_sat).toBe(35_037_334);
    expect(stats!.share_log_pct).toBeCloseTo(11.05);
    expect(stats!.rewards_in_window_sat).toBe(276_359_019);
    expect(stats!.next_block_sat).toBe(34_199_428);
    expect(stats!.time_to_payout_text).toBe('Next block');
    expect(stats!.user_hashrate_th).toBeCloseTo(710_500); // 710.5 Ph/s in TH
    expect(stats!.user_hashrate_5m_ph).toBeCloseTo(0.1501); // 60s reading
    expect(stats!.pool.pool_hashrate_ph).toBe(86);
    expect(stats!.pool.network_difficulty).toBeCloseTo(127.48e12);
    // Subsidy-only estimate for the next block after tip 961635.
    expect(stats!.pool.estimated_block_reward_sat).toBe(312_500_000);
    expect(stats!.hashprice_sat_per_ph_day).toBeGreaterThan(0);
    expect(stats!.recent_blocks).toHaveLength(1);
    // The chain-internal difficulty column must not leak into the
    // OceanBlock rows that get upserted into pool_blocks.
    expect('network_difficulty' in stats!.recent_blocks[0]!).toBe(false);
  });

  it('returns stats null when a required fragment 404s', async () => {
    const failing = (async () =>
      ({ ok: false, status: 500, text: async () => '' }) as unknown as Response) as unknown as typeof fetch;
    const client = createBip110OceanClient({ fetch: failing });
    expect(await client.fetchStats('bc1qtestaddress')).toBeNull();
  });

  it('pages payouts and filters by date range', async () => {
    const client = createBip110OceanClient({ fetch: fakeSiteFetch(), now: () => 1000 });
    const all = await client.fetchPayouts('bc1qtestaddress', '2020-01-01', '2026-12-31');
    expect(all).toHaveLength(2);
    const aug12Only = await client.fetchPayouts('bc1qtestaddress', '2026-08-10', '2026-08-12');
    expect(aug12Only).toHaveLength(1);
    expect(aug12Only![0]!.net_sat).toBe(21_899_745);
  });

  it('fetches blocks pages and returns [] past the end', async () => {
    const client = createBip110OceanClient({ fetch: fakeSiteFetch() });
    const page0 = await client.fetchBlocksPage(0, 50);
    expect(page0).toHaveLength(1);
    expect(page0[0]!.height).toBe(961_635);
    const past = await client.fetchBlocksPage(5, 50);
    expect(past).toEqual([]);
  });
});

describe('createChainAwareOceanClient', () => {
  it('dispatches per-call on the live chain value', async () => {
    let chain: 'mainstream' | 'bip110' = 'bip110';
    // The mainstream JSON client will fail against the HTML fixtures
    // (res.json is missing) and degrade to null; the bip110 scraper
    // succeeds. That asymmetry is the dispatch signal.
    const client = createChainAwareOceanClient({
      getChain: () => chain,
      fetch: fakeSiteFetch(),
      now: () => 1000,
    });
    const viaBip110 = await client.fetchStats('bc1qtestaddress');
    expect(viaBip110).not.toBeNull();
    expect(viaBip110!.unpaid_sat).toBe(18_939_196);

    chain = 'mainstream';
    const viaMainstream = await client.fetchStats('bc1qtestaddress');
    expect(viaMainstream).toBeNull();
  });
});
