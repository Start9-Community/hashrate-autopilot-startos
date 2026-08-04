/**
 * #343: deduced payouts. Ocean's earnpay endpoint does not return
 * Lightning payouts (confirmed by Ocean support, 2026-07-15), so an
 * operator paid over Lightning sees "collected" permanently short. But
 * every payout - Lightning included - debits the unpaid balance we
 * snapshot per tick, so the payout is deducible from that series: a
 * confirmed sharp drop of `tick_metrics.ocean_unpaid_sat` to ~zero
 * with no matching earnpay settlement can only be a payout the API
 * doesn't report.
 *
 * Lifecycle of a deduced payout:
 *
 *   1. A drop is confirmed (two consecutive low ticks - a single-tick
 *      API glitch never mints a payout) -> a deduced row is inserted
 *      immediately into `ocean_payouts` with rail 'unknown'. Amount is
 *      the balance DECREASE across the drop (pre-drop reading minus the
 *      residual left on the drop tick), not the full pre-drop reading:
 *      a Lightning payout can settle the older balance while leaving a
 *      freshly-credited block unpaid, so the residual is not part of
 *      the payout (#343, regenerous). Still approximate - fees and the
 *      accrual since the previous tick aren't visible.
 *   2. For 24h the row can be corrected: if Ocean's ledger produces a
 *      settlement matching in time and amount (an on-chain payout
 *      whose earnpay record lagged), the real record supersedes the
 *      deduced one - it is deleted, the real row stands.
 *   3. Past 24h with no match, the rail resolves to 'lightning' by
 *      elimination: on-chain payouts always surface in earnpay.
 *      Supersession stays armed forever, so if Ocean's API evolves to
 *      return Lightning payouts, the deduced rows converge to Ocean's
 *      truth automatically.
 *
 * The scan runs only after a SUCCESSFUL earnpay sync (see the wiring
 * in main.ts): deducing against a ledger we failed to read would
 * misclassify every on-chain payout as deduced. Full-history passes
 * (boot, the daily self-heal, rebuild, hard reset) re-derive
 * everything - drop candidates are deterministic over the immutable
 * tick history and inserts are idempotent on `dedup_key`, so deduced
 * rows survive the hard reset's delete-and-refetch by reappearing on
 * the very next pass.
 *
 * Known limitation: tick_metrics is not address-scoped, so the retro
 * scan attributes historical drops to the CURRENT payout address. For
 * the single-address operators this daemon serves that is correct; an
 * address switch mid-history would misattribute older drops.
 */

import type { EventNotesRepo } from '../state/repos/event_notes.js';
import type { OceanPayoutsRepo, OceanPayoutRow } from '../state/repos/ocean_payouts.js';
import type { TickMetricsRepo } from '../state/repos/tick_metrics.js';

/** Mirrors the payout_initiated alert heuristic (alert-evaluator.ts). */
export const DROP_FRACTION = 0.3;
/** Ocean's on-chain payout threshold - a real payout leaves residual below it. */
export const RESIDUAL_THRESHOLD_SAT = 1_048_576;
/**
 * Noise floor: ignore drops from balances under this. Ocean's lowest
 * Lightning payout floor is 65,536 sat, so 10k is safely below any
 * real payout while filtering rounding jitter on tiny balances.
 */
export const MIN_PRE_DROP_SAT = 10_000;
/**
 * The correction window: how long a deduced row stays rail 'unknown'
 * before resolving to 'lightning'. Also the time margin for matching a
 * drop against an earnpay settlement - generous on purpose, because
 * earnpay's settlement ts and our drop tick can sit hours apart.
 */
export const TYPE_RESOLUTION_MS = 24 * 60 * 60 * 1000;
/**
 * Amount margin for matching a drop against an earnpay settlement.
 * The deduced amount is the pre-drop unpaid reading; the real net
 * paid differs by fees and by whatever accrued after our last tick.
 */
export const MATCH_AMOUNT_TOLERANCE = 0.25;
/**
 * Candidates closer together than this collapse into the first one: a
 * payout that Ocean's stats surface in two steps (e.g. 100% -> 50% ->
 * 0%) would otherwise register twice. The first candidate already
 * carries the full pre-drop amount.
 */
export const DROP_COOLDOWN_MS = 30 * 60 * 1000;
/** Incremental scan window; anything older is the full pass's job. */
export const RECENT_SCAN_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export interface DropCandidate {
  readonly tick_at: number;
  readonly pre_drop_unpaid_sat: number;
  /** Residual on the drop tick itself. Payout amount = pre - post (#343). */
  readonly post_drop_unpaid_sat: number;
}

/** The deduced payout amount for a candidate: the balance decrease, floored at 0. */
export function candidateAmountSat(c: DropCandidate): number {
  return Math.max(0, c.pre_drop_unpaid_sat - c.post_drop_unpaid_sat);
}

/**
 * Collapse candidates within DROP_COOLDOWN_MS of an accepted one (input
 * must be ascending by tick_at). A payout Ocean surfaces in steps
 * (100% -> 50% -> 0%) shows as several drops; they fold into the first,
 * whose residual becomes the LAST step's residual - so the merged
 * amount (pre of first minus post of last) is the whole payout, not
 * just the first step (#343).
 */
export function collapseCooldown(
  candidates: readonly DropCandidate[],
  cooldownMs: number = DROP_COOLDOWN_MS,
): DropCandidate[] {
  const out: DropCandidate[] = [];
  let lastAccepted = Number.NEGATIVE_INFINITY;
  for (const c of candidates) {
    if (c.tick_at - lastAccepted < cooldownMs) {
      // Fold this step into the group: extend the accepted candidate's
      // residual down to this later, lower reading.
      const head = out[out.length - 1];
      if (head) {
        out[out.length - 1] = { ...head, post_drop_unpaid_sat: c.post_drop_unpaid_sat };
      }
      continue;
    }
    out.push(c);
    lastAccepted = c.tick_at;
  }
  return out;
}

/**
 * The real (earnpay) settlement matching this drop, if any: time
 * within the correction window and amount within tolerance of the
 * pre-drop reading. Used both to decide "don't deduce - the ledger
 * already has it" and to supersede an existing deduced row (where the
 * matched row also inherits the deduced row's Timeline note).
 */
export function findMatchingRealPayout<T extends Pick<OceanPayoutRow, 'ts' | 'net_sat'>>(
  real: readonly T[],
  dropTsMs: number,
  amountSat: number,
): T | undefined {
  return real.find(
    (r) =>
      Math.abs(r.ts - dropTsMs) <= TYPE_RESOLUTION_MS &&
      Math.abs(r.net_sat - amountSat) <= amountSat * MATCH_AMOUNT_TOLERANCE,
  );
}

export interface DeducedPayoutsScannerOptions {
  readonly tickMetricsRepo: TickMetricsRepo;
  readonly oceanPayoutsRepo: OceanPayoutsRepo;
  readonly getAddress: () => string;
  /** When provided, a superseded deduced row's Timeline note (`payout:<id>`) moves to the real record instead of orphaning. */
  readonly eventNotesRepo?: EventNotesRepo;
  readonly now?: () => number;
  readonly log?: (msg: string) => void;
}

export class DeducedPayoutsScanner {
  constructor(private readonly options: DeducedPayoutsScannerOptions) {}

  private get now(): () => number {
    return this.options.now ?? (() => Date.now());
  }

  /**
   * One scan pass. `fullHistory` walks the entire tick series (boot,
   * daily self-heal, rebuild, hard reset); otherwise a trailing
   * 3-day window. Never throws - a failed pass just retries on the
   * next sync.
   */
  async scan(fullHistory: boolean): Promise<void> {
    try {
      await this.doScan(fullHistory);
    } catch (err) {
      this.options.log?.(
        `[deduced-payouts] scan failed: ${(err as Error).message}`,
      );
    }
  }

  private async doScan(fullHistory: boolean): Promise<void> {
    const address = this.options.getAddress();
    if (!address) return;
    const nowMs = this.now();
    const sinceMs = fullHistory ? 0 : Math.max(0, nowMs - RECENT_SCAN_WINDOW_MS);

    const raw = await this.options.tickMetricsRepo.findUnpaidDropCandidates(sinceMs, {
      dropFraction: DROP_FRACTION,
      residualThresholdSat: RESIDUAL_THRESHOLD_SAT,
      minPreDropSat: MIN_PRE_DROP_SAT,
    });
    const candidates = collapseCooldown(raw);
    const amountByTick = new Map(candidates.map((c) => [c.tick_at, candidateAmountSat(c)]));

    const all = await this.options.oceanPayoutsRepo.listForAddressSince(address, 0);
    const real = all.filter((r) => !r.deduced);
    const deduced = all.filter((r) => r.deduced);
    const deducedTs = new Set(deduced.map((d) => d.ts));

    // New drops with no settlement in Ocean's ledger -> deduced rows.
    // Retro-derived drops already past the correction window go
    // straight to 'lightning'; fresh ones start 'unknown'.
    const inserts = candidates
      .filter(
        (c) =>
          !deducedTs.has(c.tick_at) &&
          !findMatchingRealPayout(real, c.tick_at, candidateAmountSat(c)),
      )
      .map((c) => ({
        address,
        ts_ms: c.tick_at,
        net_sat: candidateAmountSat(c),
        rail: (nowMs - c.tick_at > TYPE_RESOLUTION_MS ? 'lightning' : 'unknown') as
          | 'lightning'
          | 'unknown',
      }));
    const inserted = await this.options.oceanPayoutsRepo.insertDeducedMany(inserts, nowMs);

    // Supersede: a real settlement now matches an existing deduced
    // row. The deduced row's Timeline note (if any) moves to the real
    // record first, so the operator's comment survives the swap.
    const superseded = deduced.flatMap((d) => {
      const match = findMatchingRealPayout(real, d.ts, d.net_sat);
      return match ? [{ deduced: d, real: match }] : [];
    });
    const supersededIds = superseded.map((s) => s.deduced.id);
    if (this.options.eventNotesRepo && superseded.length > 0) {
      await this.options.eventNotesRepo.rekeyMany(
        superseded.map((s) => ({
          from: `payout:${s.deduced.id}`,
          to: `payout:${s.real.id}`,
        })),
      );
    }
    await this.options.oceanPayoutsRepo.deleteByIds(supersededIds);

    // Resolve: 'unknown' rows past the correction window, still
    // unmatched -> 'lightning' by elimination.
    const supersededSet = new Set(supersededIds);
    const resolveIds = deduced
      .filter(
        (d) =>
          !supersededSet.has(d.id) &&
          d.rail === 'unknown' &&
          nowMs - d.ts > TYPE_RESOLUTION_MS,
      )
      .map((d) => d.id);
    await this.options.oceanPayoutsRepo.resolveRailToLightning(resolveIds);

    // Repair: correct the amount of surviving deduced rows whose stored
    // net_sat no longer matches the derivation (e.g. rows written by an
    // older build that recorded the full pre-drop reading rather than
    // the balance decrease). Inserts use ON CONFLICT DO NOTHING, so a
    // formula change only fixes new rows unless we update the old ones
    // here - so an operator's history self-corrects on the next scan
    // without a hard reset (#343, regenerous).
    const repairs = deduced
      .filter((d) => !supersededSet.has(d.id) && amountByTick.has(d.ts))
      .flatMap((d) => {
        const amount = amountByTick.get(d.ts)!;
        return amount !== d.net_sat ? [{ id: d.id, net_sat: amount }] : [];
      });
    const repaired = await this.options.oceanPayoutsRepo.updateDeducedAmounts(repairs);

    if (inserted > 0 || supersededIds.length > 0 || resolveIds.length > 0 || repaired > 0) {
      this.options.log?.(
        `[deduced-payouts] ${fullHistory ? 'full' : 'incremental'} scan: ` +
          `${candidates.length} drop(s), ${inserted} deduced, ` +
          `${supersededIds.length} superseded, ${resolveIds.length} resolved to lightning, ` +
          `${repaired} amount-repaired`,
      );
    }
  }
}
