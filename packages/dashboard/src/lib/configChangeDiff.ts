/**
 * Semantic diffing for config-change records whose stored value is a
 * JSON list, a comma-list, or a JSON color map (dashboard_tiles,
 * dashboard_card_order, notification_disabled_event_classes,
 * chart_color_overrides). The raw stored form is an opaque JSON blob
 * that renders unreadably in the Timeline; these helpers turn an
 * old->new pair into "what actually changed" so the detail panel can
 * show `+ Added`, `- Removed`, or `Reordered` instead of a wall of ids.
 *
 * Pure - no i18n, no JSX. History.tsx composes the translated summary
 * string and the detail JSX (swatches, friendly names) on top of these.
 */

const JSON_LIST_FIELDS = new Set(['dashboard_tiles', 'dashboard_card_order']);
const COMMA_LIST_FIELDS = new Set(['notification_disabled_event_classes']);
const COLOR_MAP_FIELDS = new Set(['chart_color_overrides']);

/** True for a field whose value is an ordered list of ids. */
export function isListField(field: string): boolean {
  return JSON_LIST_FIELDS.has(field) || COMMA_LIST_FIELDS.has(field);
}

/** True for a field whose value is a `{ key: "#hex" }` color map. */
export function isColorMapField(field: string): boolean {
  return COLOR_MAP_FIELDS.has(field);
}

/** Parse a stored list value into its id array. Tolerant of junk. */
export function parseIdList(field: string, raw: string | null): string[] {
  if (!raw) return [];
  if (COMMA_LIST_FIELDS.has(field)) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export interface ListDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** Same membership, different order. */
  readonly reorderedOnly: boolean;
  /** Identical list (no-op change - rare, but possible from a re-save). */
  readonly unchanged: boolean;
  /** Size of the new list. */
  readonly count: number;
}

export function diffIdList(oldArr: readonly string[], newArr: readonly string[]): ListDiff {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  const added = newArr.filter((id) => !oldSet.has(id));
  const removed = oldArr.filter((id) => !newSet.has(id));
  const sameSet = added.length === 0 && removed.length === 0;
  const sameOrder =
    sameSet && oldArr.length === newArr.length && oldArr.every((id, i) => id === newArr[i]);
  return {
    added,
    removed,
    reorderedOnly: sameSet && !sameOrder,
    unchanged: sameOrder,
    count: newArr.length,
  };
}

export function parseColorMap(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export interface ColorChange {
  readonly key: string;
  readonly from: string | null;
  readonly to: string | null;
}

/** Per-series color changes (added / removed / recolored). */
export function diffColorMap(oldRaw: string | null, newRaw: string | null): ColorChange[] {
  const o = parseColorMap(oldRaw);
  const n = parseColorMap(newRaw);
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].sort();
  const changed: ColorChange[] = [];
  for (const k of keys) {
    if (o[k] !== n[k]) changed.push({ key: k, from: o[k] ?? null, to: n[k] ?? null });
  }
  return changed;
}
