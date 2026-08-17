/**
 * #363: Ocean stats client for the BIP110 sharelog.
 *
 * Since the 8/8/2026 chain split Ocean runs two chains with separate
 * TIDES accounting: the mainstream chain (api.ocean.xyz JSON API,
 * ocean.xyz site) and the BIP110 chain (bip110.ocean.xyz site). The
 * BIP110 side has NO JSON API - probed 2026-08-17: no api.bip110
 * subdomain resolves, /v1/* on bip110.ocean.xyz 404s, and
 * api.ocean.xyz ignores every chain-selection query param while
 * reporting BIP110-only miners as "No such user". The only
 * machine-readable source is the site's own HTML template fragments -
 * the same `/template/workers/*` endpoints this project scraped from
 * ocean.xyz before issue #9 switched to the JSON API (see commit
 * 201c2f59's parent for the original scraper this revives).
 *
 * Data sources per field:
 *
 *   /template/workers/payoutcards?user=<addr>   unpaid, time-to-payout
 *   /template/workers/lifetimecards?user=<addr> share log %, daily est,
 *                                               lifetime earnings
 *   /template/workers/earningscards?user=<addr> rewards in window,
 *                                               next-block estimate
 *   /template/workers/rows?user=<addr>          per-worker hashrates
 *                                               ("Total" row: 60s, 3hr)
 *   /template/poolstatus                        pool hashrate, tip height
 *   /dashboard?bpage=N                          blocks found (15/page,
 *                                               incl. shared pre-fork
 *                                               history), network
 *                                               difficulty per block
 *   /template/workers/payouts/rows?user=&ppage= payout settlements
 *
 * Fields with no BIP110-side source degrade to null (active_users,
 * active_workers). The site publishes a 60s hashrate but not the 300s
 * one the JSON API has, so `user_hashrate_5m_ph` carries the 60s
 * reading - noisier, but the closest "current" value available.
 *
 * Block rewards: the BIP110 site lists no per-block reward, so scraped
 * blocks carry subsidy-by-height (halving schedule) with fees_sat 0,
 * and the estimated block reward / hashprice are subsidy-only - a
 * slight underestimate versus the mainstream client's fee-inclusive
 * figures.
 *
 * A sat here is a BIP110-chain sat, not a mainstream-chain sat. The
 * daemon reports what Ocean reports for the selected sharelog;
 * cross-chain market-value judgment stays with the operator.
 */

import { USER_AGENT } from '../http/routes/build.js';
import {
  createOceanClient,
  parseOceanTs,
  type OceanBlock,
  type OceanClient,
  type OceanClientOptions,
  type OceanPayout,
  type OceanStats,
} from './ocean.js';

const BIP110_BASE = 'https://bip110.ocean.xyz';
const PAYOUT_THRESHOLD_SAT = 1_048_576;
const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const SAT_PER_BTC = 100_000_000;
const BLOCKS_PER_DAY = 144;
// Safety bound for the payout-history pager (pages hold ~5-15 rows).
const MAX_PAYOUT_PAGES = 100;

/** Block subsidy by height - halvings every 210,000 blocks. */
export function subsidySatForHeight(height: number): number {
  const halvings = Math.floor(height / 210_000);
  if (halvings >= 33) return 0;
  return Math.floor(50 * SAT_PER_BTC / 2 ** halvings);
}

export function createBip110OceanClient(
  opts: OceanClientOptions = {},
): OceanClient {
  const fetchImpl = opts.fetch ?? fetch;
  const ttl = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = opts.now ?? (() => Date.now());

  const statsCache = new Map<string, OceanStats>();
  const payoutsCache = new Map<
    string,
    { fetched_at_ms: number; payouts: OceanPayout[] }
  >();

  async function fetchBlocksPage(
    page: number,
    _pageSize: number,
  ): Promise<OceanBlock[]> {
    // The dashboard serves fixed 15-row pages (bpage is 1-based);
    // pageSize can't be honoured and is ignored. The backfill loops
    // pages until empty or past its cutoff, so natural page size is
    // fine. An out-of-range bpage renders an empty table -> [].
    try {
      const html = await getText(
        fetchImpl,
        `${BIP110_BASE}/dashboard?bpage=${page + 1}`,
      );
      return parseBlockRows(html);
    } catch (err) {
      console.warn(
        `[ocean-bip110] fetchBlocksPage failed: ${(err as Error).message}`,
      );
      return [];
    }
  }

  async function fetchPayouts(
    address: string,
    startDate: string,
    endDate: string,
  ): Promise<OceanPayout[] | null> {
    const key = `${address}|${startDate}|${endDate}`;
    const cached = payoutsCache.get(key);
    if (cached && now() - cached.fetched_at_ms < ttl) return cached.payouts;

    try {
      const startMs = parseOceanTs(`${startDate}T00:00:00`);
      const endMs = parseOceanTs(`${endDate}T00:00:00`) + 24 * 60 * 60 * 1000;
      const all: OceanPayout[] = [];
      let prevFirstTxid: string | null = null;
      for (let ppage = 1; ppage <= MAX_PAYOUT_PAGES; ppage += 1) {
        const html = await getText(
          fetchImpl,
          `${BIP110_BASE}/template/workers/payouts/rows?user=${address}&ppage=${ppage}`,
        );
        const rows = parsePayoutRows(html);
        if (rows.length === 0) break;
        // An out-of-range ppage may re-serve the last page - detect by
        // an unchanged leading txid and stop.
        const firstTxid = rows[0]!.on_chain_txid;
        if (firstTxid !== null && firstTxid === prevFirstTxid) break;
        prevFirstTxid = firstTxid;
        all.push(...rows);
        // Rows come newest-first; once past the requested window's
        // start there is nothing older worth fetching.
        const oldest = rows[rows.length - 1]!.ts_ms;
        if (oldest < startMs) break;
      }
      const payouts = all.filter(
        (p) => p.ts_ms >= startMs && p.ts_ms < endMs && p.net_sat > 0,
      );
      payoutsCache.set(key, { fetched_at_ms: now(), payouts });
      return payouts;
    } catch (err) {
      console.warn(
        `[ocean-bip110] fetchPayouts(${address}) failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  return {
    fetchBlocksPage,
    fetchPayouts,
    async fetchStats(address: string): Promise<OceanStats | null> {
      const cached = statsCache.get(address);
      if (cached && now() - cached.fetched_at_ms < ttl) return cached;

      try {
        const [payout, lifetime, earnings, workers, poolStatus, dashboard] =
          await Promise.all([
            getText(fetchImpl, `${BIP110_BASE}/template/workers/payoutcards?user=${address}`),
            getText(fetchImpl, `${BIP110_BASE}/template/workers/lifetimecards?user=${address}`),
            getText(fetchImpl, `${BIP110_BASE}/template/workers/earningscards?user=${address}`),
            getText(fetchImpl, `${BIP110_BASE}/template/workers/rows?user=${address}`),
            getText(fetchImpl, `${BIP110_BASE}/template/poolstatus`).catch(() => ''),
            getText(fetchImpl, `${BIP110_BASE}/dashboard`).catch(() => ''),
          ]);

        // #362 guard is inherited structurally: the value regexes only
        // match unsigned numbers, so a negative unpaid reading parses
        // to null rather than poisoning the series.
        const unpaid_sat = parseBtcLabel(payout, 'Unpaid Earnings');
        const time_to_payout_text =
          parseRawSpanLabel(payout, 'Estimated Time Until Minimum Payout');
        const lifetime_sat = parseBtcLabel(lifetime, 'Lifetime Earnings');
        const daily_estimate_sat = parseBtcLabel(lifetime, 'Estimated Earnings Per Day');
        const share_log_pct = parsePctLabel(lifetime, 'Share Log %');
        const rewards_in_window_sat = parseBtcLabel(earnings, 'Estimated Rewards In Window');
        const next_block_sat = parseBtcLabel(earnings, 'Estimated Earnings Next Block');

        // Workers table "Total" row: cells are [name, status, last
        // share, hashrate (60s), hashrate (3hr)].
        const totals = parseTotalRowHashrates(workers);
        const user_hashrate_th =
          totals.h3h_hs !== null && totals.h3h_hs > 0 ? totals.h3h_hs / 1e12 : null;
        const user_hashrate_5m_ph =
          totals.h60s_hs !== null && totals.h60s_hs > 0 ? totals.h60s_hs / 1e15 : null;

        // Pool status banner: "HASHRATE: 86.28 Ph/s ... LAST BLOCK:
        // 961635 (4D AGO)".
        const poolHashrateHs = parseHashrate(
          firstMatch(poolStatus, /HASHRATE:\s*([\d.]+\s*[KMGTPE]?h\/s)/i),
        );
        const pool_hashrate_ph =
          poolHashrateHs !== null && poolHashrateHs > 0
            ? Math.round(poolHashrateHs / 1e15)
            : null;
        const tipHeightStr = firstMatch(poolStatus, /LAST BLOCK:\s*(\d+)/i);
        const tipHeight = tipHeightStr !== null ? Number(tipHeightStr) : null;

        const recent_blocks = parseBlockRows(dashboard);

        // Network difficulty: the blocks table prints it per block
        // ("127.48T"). Two-decimal precision only feeds the pool info
        // display and the hashprice estimate - good enough.
        const network_difficulty =
          recent_blocks.length > 0 ? recent_blocks[0]!.network_difficulty : null;

        const estimated_block_reward_sat =
          tipHeight !== null && tipHeight > 0
            ? subsidySatForHeight(tipHeight + 1)
            : null;

        const networkHashratePh =
          network_difficulty !== null && network_difficulty > 0
            ? (network_difficulty * 2 ** 32) / 600 / 1e15
            : null;
        const hashprice_sat_per_ph_day =
          networkHashratePh !== null &&
          networkHashratePh > 0 &&
          estimated_block_reward_sat !== null
            ? Math.round(
                (BLOCKS_PER_DAY * estimated_block_reward_sat) / networkHashratePh,
              )
            : null;

        const stats: OceanStats = {
          unpaid_sat,
          lifetime_sat,
          rewards_in_window_sat,
          next_block_sat,
          daily_estimate_sat,
          hashprice_sat_per_ph_day,
          time_to_payout_text,
          share_log_pct,
          payout_threshold_sat: PAYOUT_THRESHOLD_SAT,
          recent_blocks: recent_blocks.map(({ network_difficulty: _d, ...b }) => b),
          pool: {
            active_users: null,
            active_workers: null,
            network_difficulty,
            pool_hashrate_ph,
            estimated_block_reward_sat,
          },
          user_hashrate_th,
          user_hashrate_5m_ph,
          fetched_at_ms: now(),
        };
        statsCache.set(address, stats);
        return stats;
      } catch (err) {
        console.warn(
          `[ocean-bip110] fetchStats(${address}) failed: ${(err as Error).message}`,
        );
        return null;
      }
    },
  };
}

export type OceanChain = 'mainstream' | 'bip110';

export interface ChainAwareOceanClientOptions extends OceanClientOptions {
  /** Read live on every call so a dashboard config save takes effect
   *  on the very next fetch, no daemon restart needed. */
  readonly getChain: () => OceanChain;
}

/**
 * #363: dispatches every OceanClient call to the JSON-API client
 * (mainstream chain) or the bip110.ocean.xyz scraper, per the live
 * `ocean_chain` config value. Both delegates keep their own caches, so
 * flipping the setting serves fresh data from the other source within
 * one cache TTL.
 */
export function createChainAwareOceanClient(
  opts: ChainAwareOceanClientOptions,
): OceanClient {
  const { getChain, ...clientOpts } = opts;
  const mainstream = createOceanClient(clientOpts);
  const bip110 = createBip110OceanClient(clientOpts);
  const pick = (): OceanClient =>
    getChain() === 'bip110' ? bip110 : mainstream;
  return {
    fetchStats: (address) => pick().fetchStats(address),
    fetchBlocksPage: (page, pageSize) => pick().fetchBlocksPage(page, pageSize),
    fetchPayouts: (address, start, end) => pick().fetchPayouts(address, start, end),
  };
}

// ---------------------------------------------------------------------------
// HTML parsing helpers (revived from the pre-#9 scraper)
// ---------------------------------------------------------------------------

async function getText(fetchImpl: typeof fetch, url: string): Promise<string> {
  const res = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`GET ${url} returned ${res.status}`);
  }
  return res.text();
}

/**
 * Find the value `<span>0.00356948 BTC</span>` following a
 * `<div class="blocks-label">Unpaid Earnings ...` block. The
 * .blocks-label DIV nests a tooltip whose `<span class="tooltiptext">`
 * comes BEFORE the value span, so patterns must require a bare
 * `<span>` with no attributes - Ocean's value convention throughout.
 */
export function parseBtcLabel(html: string, label: string): number | null {
  const m = html.match(
    new RegExp(
      String.raw`blocks-label">\s*` +
        escapeRegex(label) +
        String.raw`[\s\S]*?<span>\s*([\d.]+)\s*BTC\s*</span>`,
    ),
  );
  if (!m || !m[1]) return null;
  const btc = Number.parseFloat(m[1]);
  if (!Number.isFinite(btc)) return null;
  return Math.round(btc * SAT_PER_BTC);
}

export function parsePctLabel(html: string, label: string): number | null {
  const m = html.match(
    new RegExp(
      String.raw`blocks-label">\s*` +
        escapeRegex(label) +
        String.raw`[\s\S]*?<span>\s*([\d.]+)\s*%\s*</span>`,
    ),
  );
  if (!m || !m[1]) return null;
  const pct = Number.parseFloat(m[1]);
  return Number.isFinite(pct) ? pct : null;
}

/** Label -> text of the bare value span ("Next block", "11 days"). */
export function parseRawSpanLabel(html: string, label: string): string | null {
  const m = html.match(
    new RegExp(
      String.raw`blocks-label">\s*` +
        escapeRegex(label) +
        String.raw`[\s\S]*?<span>([\s\S]*?)</span>`,
    ),
  );
  if (!m || !m[1]) return null;
  const text = m[1].replace(/<[^>]+>/g, '').trim();
  return text.length > 0 ? text : null;
}

/** "150.1 Th/s" -> H/s. Case-insensitive on the magnitude prefix. */
export function parseHashrate(raw: string | null): number | null {
  if (raw === null) return null;
  const m = raw.match(/([\d.]+)\s*([KMGTPE])?h\/s/i);
  if (!m || !m[1]) return null;
  const value = Number.parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const mult: Record<string, number> = {
    K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
  };
  return value * (m[2] ? mult[m[2].toUpperCase()] ?? 1 : 1);
}

/** "127.48T" (difficulty shorthand) -> absolute number. */
export function parseSuffixedNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const m = raw.match(/([\d.]+)\s*([KMGTPE])?/);
  if (!m || !m[1]) return null;
  const value = Number.parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const mult: Record<string, number> = {
    K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
  };
  return value * (m[2] ? mult[m[2].toUpperCase()] ?? 1 : 1);
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m && m[1] !== undefined ? m[1] : null;
}

/**
 * The workers table's "Total" row: [name, status, last share,
 * hashrate (60s), hashrate (3hr)]. The row is identified by its
 * `/stats/<addr>` link text "Total".
 */
export function parseTotalRowHashrates(html: string): {
  h60s_hs: number | null;
  h3h_hs: number | null;
} {
  const rows = html.match(/<tr class="table-row">[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    if (!/>\s*Total\s*</.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>\s*([\d.]+\s*[KMGTPE]?h\/s)\s*<\/td>/gi)];
    return {
      h60s_hs: parseHashrate(cells[0]?.[1] ?? null),
      h3h_hs: parseHashrate(cells[1]?.[1] ?? null),
    };
  }
  return { h60s_hs: null, h3h_hs: null };
}

type ParsedBlock = OceanBlock & { readonly network_difficulty: number | null };

/**
 * Blocks rows on /dashboard?bpage=N. Cells: Found (UTC datetime),
 * Shares, Difficulty, Solver (username via /stats/<addr> link, worker
 * via tooltip), Height, Hash. No per-block reward is published -
 * subsidy-by-height stands in, fees 0.
 */
export function parseBlockRows(html: string): ParsedBlock[] {
  const rows =
    html.match(/<tr[^>]*>(?:(?!<\/tr>)[\s\S])*?\/info\/block\/[\s\S]*?<\/tr>/g) ?? [];
  const out: ParsedBlock[] = [];
  for (const row of rows) {
    const height = Number(
      firstMatch(row, /<td class="table-cell">\s*(\d+)\s*<\/td>\s*<td class="table-cell blockhash-text"/) ??
        firstMatch(row, />(\d{6,})</) ??
        0,
    );
    const hash = firstMatch(row, /\/info\/block\/([0-9a-f]{64})/) ?? '';
    const ts = firstMatch(row, /class="date-text">([\d-]+ [\d:]+)</);
    const timestamp_ms = ts !== null ? parseOceanTs(ts.replace(' ', 'T')) : 0;
    const username = firstMatch(row, /href="\/stats\/([a-zA-Z0-9]+)"/) ?? '';
    const worker = firstMatch(row, /Worker:\s*([^<\s]+)/) ?? '';
    // Difficulty is the cell right before the solver cell; grab the
    // first shorthand-suffixed number that is NOT the shares cell by
    // taking the second of the two ("22.94T" shares, "127.48T" diff).
    const shorthand = [...row.matchAll(/<td class="table-cell"\s*>\s*([\d.]+[KMGTPE])\s*<\/td>/g)];
    const network_difficulty = parseSuffixedNumber(shorthand[1]?.[1] ?? null);
    if (height <= 0 || hash === '') continue;
    const subsidy = subsidySatForHeight(height);
    out.push({
      height,
      timestamp_ms,
      total_reward_sat: subsidy,
      subsidy_sat: subsidy,
      fees_sat: 0,
      worker,
      username,
      block_hash: hash,
      network_difficulty,
    });
  }
  return out;
}

/**
 * Payout rows: Time | Txn ID (link to /info/tx/<txid>) | Amount BTC.
 * All BIP110-side settlements observed so far are on-chain sweeps;
 * a row with no tx link parses with a null txid (Lightning-style),
 * though Lightning is paused while dual-TIDES is active.
 */
export function parsePayoutRows(html: string): OceanPayout[] {
  const rows = html.match(/<tr class="table-row">[\s\S]*?<\/tr>/g) ?? [];
  const out: OceanPayout[] = [];
  for (const row of rows) {
    const ts = firstMatch(row, /class="date-text">([\d-]+ [\d:]+)</);
    if (ts === null) continue;
    const ts_ms = parseOceanTs(ts.replace(' ', 'T'));
    const txid = firstMatch(row, /\/info\/tx\/([0-9a-f]{64})/);
    const btcStr = firstMatch(row, />\s*([\d.]+)\s*BTC\s*</);
    if (btcStr === null) continue;
    const btc = Number.parseFloat(btcStr);
    if (!Number.isFinite(btc)) continue;
    out.push({
      ts_ms,
      on_chain_txid: txid,
      net_sat: Math.round(btc * SAT_PER_BTC),
      is_generation: false,
    });
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
