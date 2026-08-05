/**
 * Braiins-side bid-pause spans for the hatched background bands on the
 * charts (#287). A span opens on BID_PAUSED and closes when that pause
 * ends.
 *
 * A pause ends in three ways, not one:
 *  - BID_RESUMED  - Braiins resumed the same bid.
 *  - CANCEL_BID   - the paused bid was cancelled (e.g. the stop-spend
 *                   protection cancels after a sustained Datum outage -
 *                   exactly the case where a paused bid never "resumes",
 *                   it just goes away).
 *  - CREATE_BID   - a new primary bid supersedes the paused one.
 *
 * The original logic closed only on BID_RESUMED, so a paused-then-
 * cancelled bid left the span open to +Infinity and painted the
 * replacement (active, delivering) bid as paused - the "Braiins says
 * ACTIVE but the chart shows paused" report, 2026-07-07.
 *
 * Pure + unit-tested. The caller clamps +Infinity to the chart's data
 * edge.
 */

export interface PauseSpanEvent {
  readonly kind: string;
  readonly occurred_at: number;
  readonly braiins_order_id: string | null;
}

export interface PauseInterval {
  readonly x0: number;
  readonly x1: number;
}

export function computeBidPauseIntervals(
  events: readonly PauseSpanEvent[],
): PauseInterval[] {
  const relevant = events
    .filter(
      (e) =>
        e.kind === 'BID_PAUSED' ||
        e.kind === 'BID_RESUMED' ||
        e.kind === 'CANCEL_BID' ||
        e.kind === 'CREATE_BID',
    )
    .slice()
    .sort((a, b) => a.occurred_at - b.occurred_at);

  const intervals: PauseInterval[] = [];
  let open: { at: number; orderId: string | null } | null = null;

  for (const e of relevant) {
    if (e.kind === 'BID_PAUSED') {
      // First pause wins; a second PAUSED before any close is ignored.
      if (open === null) open = { at: e.occurred_at, orderId: e.braiins_order_id };
      continue;
    }
    if (open === null) continue;

    // RESUMED / CANCEL reference a specific order - only close our open
    // pause if it's the same bid (or the id is unknown on either side).
    // CREATE is always a new order, so it always ends a prior pause.
    const sameOrder =
      e.braiins_order_id == null || open.orderId == null || e.braiins_order_id === open.orderId;
    const closes =
      e.kind === 'CREATE_BID' ||
      ((e.kind === 'BID_RESUMED' || e.kind === 'CANCEL_BID') && sameOrder);

    if (closes) {
      intervals.push({ x0: open.at, x1: e.occurred_at });
      open = null;
    }
  }

  // Still open at the end = genuinely paused right now (charts clamp to
  // the data edge). An orphan RESUMED with no open pause is ignored:
  // we have no substantiated start time.
  if (open !== null) intervals.push({ x0: open.at, x1: Number.POSITIVE_INFINITY });
  return intervals;
}
