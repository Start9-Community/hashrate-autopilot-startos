import { describe, expect, it } from 'vitest';

import { formatDuration } from './format';

describe('formatDuration (#341: round-to-nearest, not truncate)', () => {
  it('returns "-" for null/undefined/negative', () => {
    expect(formatDuration(null)).toBe('-');
    expect(formatDuration(undefined)).toBe('-');
    expect(formatDuration(-1)).toBe('-');
  });

  it('shows exact seconds under a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(29_000)).toBe('29s');
    expect(formatDuration(56_000)).toBe('56s');
  });

  it('rounds minutes to nearest (the 15m56s -> 16m bug)', () => {
    // 15m56s: floor would say 15m; the recovery body says 16m.
    expect(formatDuration(15 * 60_000 + 56_000)).toBe('16m');
    // 15m29s stays 15m; 15m30s rounds up to 16m.
    expect(formatDuration(15 * 60_000 + 29_000)).toBe('15m');
    expect(formatDuration(15 * 60_000 + 30_000)).toBe('16m');
  });

  it('carries a rounded-up minute into the hour tier', () => {
    // 59m40s -> 1h, not "0h 60m".
    expect(formatDuration(59 * 60_000 + 40_000)).toBe('1h');
    expect(formatDuration(3 * 3_600_000 + 4 * 60_000 + 10_000)).toBe('3h 4m');
  });

  it('carries a rounded-up hour into the day tier', () => {
    // 23h59m40s -> 1d, not "0d 24h".
    expect(formatDuration(23 * 3_600_000 + 59 * 60_000 + 40_000)).toBe('1d');
    expect(formatDuration(2 * 86_400_000 + 5 * 3_600_000)).toBe('2d 5h');
  });
});
