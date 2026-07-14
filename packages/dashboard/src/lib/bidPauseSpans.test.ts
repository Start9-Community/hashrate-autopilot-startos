import { describe, expect, it } from 'vitest';

import { computeBidPauseIntervals, type PauseSpanEvent } from './bidPauseSpans';

const ev = (
  kind: string,
  occurred_at: number,
  braiins_order_id: string | null = 'A',
): PauseSpanEvent => ({ kind, occurred_at, braiins_order_id });

describe('computeBidPauseIntervals', () => {
  it('pairs PAUSED -> RESUMED', () => {
    expect(
      computeBidPauseIntervals([ev('BID_PAUSED', 100), ev('BID_RESUMED', 200)]),
    ).toEqual([{ x0: 100, x1: 200 }]);
  });

  it('CLOSES a pause on CANCEL of the same order (the 2026-07-07 bug)', () => {
    // Old order paused, then cancelled by stop-spend, then a new order
    // created. The span must end at the cancel, NOT run to +Infinity.
    const intervals = computeBidPauseIntervals([
      ev('EDIT_PRICE', 50, 'A'),
      ev('BID_PAUSED', 100, 'A'),
      ev('CANCEL_BID', 160, 'A'),
      ev('CREATE_BID', 220, 'B'),
    ]);
    expect(intervals).toEqual([{ x0: 100, x1: 160 }]);
    expect(intervals.some((i) => i.x1 === Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('closes a pause when a new bid supersedes it (cancel not logged)', () => {
    expect(
      computeBidPauseIntervals([ev('BID_PAUSED', 100, 'A'), ev('CREATE_BID', 150, 'B')]),
    ).toEqual([{ x0: 100, x1: 150 }]);
  });

  it('leaves the span open (+Infinity) when genuinely still paused', () => {
    const intervals = computeBidPauseIntervals([ev('BID_PAUSED', 100, 'A')]);
    expect(intervals).toEqual([{ x0: 100, x1: Number.POSITIVE_INFINITY }]);
  });

  it('ignores an orphan RESUMED with no open pause', () => {
    expect(computeBidPauseIntervals([ev('BID_RESUMED', 200, 'A')])).toEqual([]);
  });

  it('does not close on a DIFFERENT order cancel', () => {
    // Bid A paused; an unrelated order B cancel must not close A's pause.
    const intervals = computeBidPauseIntervals([
      ev('BID_PAUSED', 100, 'A'),
      ev('CANCEL_BID', 150, 'B'),
    ]);
    // B's cancel doesn't resume A, but note CREATE would; here only a
    // cross-order CANCEL, so A stays open.
    expect(intervals).toEqual([{ x0: 100, x1: Number.POSITIVE_INFINITY }]);
  });

  it('handles multiple pause/resume cycles', () => {
    expect(
      computeBidPauseIntervals([
        ev('BID_PAUSED', 100),
        ev('BID_RESUMED', 200),
        ev('BID_PAUSED', 300),
        ev('CANCEL_BID', 350),
      ]),
    ).toEqual([
      { x0: 100, x1: 200 },
      { x0: 300, x1: 350 },
    ]);
  });
});
