import { describe, expect, it } from 'vitest';

import {
  isListField,
  isColorMapField,
  parseIdList,
  diffIdList,
  diffColorMap,
} from './configChangeDiff';

describe('configChangeDiff', () => {
  it('classifies fields', () => {
    expect(isListField('dashboard_tiles')).toBe(true);
    expect(isListField('notification_disabled_event_classes')).toBe(true);
    expect(isColorMapField('chart_color_overrides')).toBe(true);
    expect(isListField('max_bid_sat_per_eh_day')).toBe(false);
    expect(isColorMapField('dashboard_tiles')).toBe(false);
  });

  it('parses JSON-array and comma-list fields', () => {
    expect(parseIdList('dashboard_tiles', '["a","b","c"]')).toEqual(['a', 'b', 'c']);
    expect(parseIdList('notification_disabled_event_classes', 'x, y ,z')).toEqual(['x', 'y', 'z']);
    expect(parseIdList('dashboard_tiles', 'not json')).toEqual([]);
    expect(parseIdList('dashboard_tiles', null)).toEqual([]);
  });

  it('detects a single swap (the screenshot case)', () => {
    const d = diffIdList(
      ['uptime', 'pool_luck_24h', 'avg_cost_delivered'],
      ['uptime', 'pool_luck_24h', 'avg_cost_vs_hashprice'],
    );
    expect(d.added).toEqual(['avg_cost_vs_hashprice']);
    expect(d.removed).toEqual(['avg_cost_delivered']);
    expect(d.reorderedOnly).toBe(false);
    expect(d.unchanged).toBe(false);
  });

  it('detects an order-only change', () => {
    const d = diffIdList(['a', 'b', 'c'], ['c', 'a', 'b']);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.reorderedOnly).toBe(true);
    expect(d.unchanged).toBe(false);
    expect(d.count).toBe(3);
  });

  it('detects an identical (no-op) save', () => {
    const d = diffIdList(['a', 'b'], ['a', 'b']);
    expect(d.reorderedOnly).toBe(false);
    expect(d.unchanged).toBe(true);
  });

  it('handles pure add and pure remove', () => {
    expect(diffIdList(['a'], ['a', 'b']).added).toEqual(['b']);
    expect(diffIdList(['a', 'b'], ['a']).removed).toEqual(['b']);
  });

  it('diffs a color map: recolor, add, remove', () => {
    const changes = diffColorMap(
      '{"price.bid":"#111111","price.hashprice":"#222222"}',
      '{"price.bid":"#999999","hashrate.received":"#333333"}',
    );
    // Sorted by key: hashrate.received (added), price.bid (recolored), price.hashprice (removed)
    expect(changes).toEqual([
      { key: 'hashrate.received', from: null, to: '#333333' },
      { key: 'price.bid', from: '#111111', to: '#999999' },
      { key: 'price.hashprice', from: '#222222', to: null },
    ]);
  });

  it('empty color map diff when unchanged', () => {
    expect(diffColorMap('{"a":"#111"}', '{"a":"#111"}')).toEqual([]);
    expect(diffColorMap(null, null)).toEqual([]);
  });
});
