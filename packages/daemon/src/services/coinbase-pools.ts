/**
 * #335: canonical pool identification from a coinbase, using mempool's
 * curated mining-pool database (`data/pools-v2.json`). A pure heuristic
 * on the coinbase scriptsig mangles real tags - Foundry's coinbase reads
 * "(/Foundry USA Pool #dropgold/", where "(" is a raw push byte and
 * "#dropgold" is a slogan, not a worker. mempool solves this the same way
 * every block explorer does: match the coinbase output address (most
 * reliable - a pool's payout address is stable) or a known coinbase tag
 * against a curated list, and return the pool's canonical name.
 *
 * Source: https://github.com/mempool/mining-pools (pools-v2.json).
 * Refresh occasionally from upstream; the format is a flat array of
 * { id, name, addresses[], tags[], link }.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PoolDef {
  readonly id: number;
  readonly name: string;
  readonly addresses: readonly string[];
  readonly tags: readonly string[];
  readonly link: string;
}

export interface IdentifiedPool {
  readonly name: string;
  readonly link: string;
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
// Copied into dist/data by the build step, mirroring the migrations copy.
const DEFAULT_POOLS_PATH = join(MODULE_DIR, '..', 'data', 'pools-v2.json');

function loadPools(path: string): PoolDef[] {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as PoolDef[];
  } catch {
    // Missing/corrupt DB degrades to "no match" - callers fall back to
    // the raw coinbase tag, never error.
    return [];
  }
}

/**
 * The printable-ASCII rendering of a coinbase scriptsig, with
 * non-printable bytes collapsed to single spaces so tag substrings that
 * span a push boundary still match (mempool matches against the raw
 * scriptsig bytes; the printable projection is a close, safe proxy).
 */
export function coinbaseAscii(coinbaseHex: string): string {
  const bytes = Buffer.from(coinbaseHex, 'hex');
  let out = '';
  let gap = false;
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) {
      if (gap && out.length > 0) out += ' ';
      gap = false;
      out += String.fromCharCode(b);
    } else {
      gap = true;
    }
  }
  return out;
}

/**
 * Build an address->pool and tag->pool index once. Address lookup is
 * exact; tag lookup is a case-sensitive substring test in pool order
 * (first curated match wins), matching mempool's own precedence.
 */
export class PoolIdentifier {
  private readonly byAddress = new Map<string, IdentifiedPool>();
  private readonly tagList: { tag: string; pool: IdentifiedPool }[] = [];

  constructor(pools: readonly PoolDef[] = loadPools(DEFAULT_POOLS_PATH)) {
    for (const p of pools) {
      const ident: IdentifiedPool = { name: p.name, link: p.link };
      for (const a of p.addresses ?? []) {
        if (!this.byAddress.has(a)) this.byAddress.set(a, ident);
      }
      for (const tag of p.tags ?? []) {
        if (tag.length > 0) this.tagList.push({ tag, pool: ident });
      }
    }
  }

  /**
   * Identify the pool that mined a block from its coinbase. Prefer the
   * coinbase output addresses (stable, unambiguous); fall back to a
   * known coinbase tag. Returns null when nothing matches.
   */
  identify(coinbaseHex: string, outputAddresses: readonly string[]): IdentifiedPool | null {
    for (const addr of outputAddresses) {
      const hit = this.byAddress.get(addr);
      if (hit) return hit;
    }
    const ascii = coinbaseAscii(coinbaseHex);
    for (const { tag, pool } of this.tagList) {
      if (ascii.includes(tag)) return pool;
    }
    return null;
  }
}

/** Shared default instance (DB loaded once at first import). */
export const defaultPoolIdentifier = new PoolIdentifier();
