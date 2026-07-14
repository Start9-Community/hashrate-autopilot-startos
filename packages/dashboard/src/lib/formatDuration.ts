/**
 * Duration formatter, split out of {@link ./format} so it can be unit
 * tested without dragging in that module's `@lingui/core/macro` import.
 * The macro transform needs the dashboard's lingui config on the babel
 * cwd, which isn't present when vitest runs from the repo root (how
 * `deploy.sh` runs the suite) - so any test importing a macro-using
 * module fails there. This file has no lingui dependency, so its test
 * runs anywhere. `format.ts` re-exports `formatDuration` for callers.
 */

/**
 * Format a raw duration (in ms) as "Xs", "Xm", "Xh Ym", "Xd Yh" - the
 * same shape as `formatAgeMinutes` but without the trailing "ago",
 * because the value is a duration not an offset-from-now. Used by event
 * cards on the Alerts page ("was open for 6m") where the value is
 * `recovery.created_at - firing.created_at`.
 *
 * #341: rounds the smallest displayed unit to nearest (>=30s rounds a
 * minute up), not truncates. 15m56s reads as "16m", matching the
 * daemon's own recovery-body wording ("was zero for 16m") instead of a
 * misleading "15m". Rounding can carry into the next tier (59m40s ->
 * "1h"), so each tier is recomputed and normalised.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '-';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  if (ms < 24 * 3_600_000) {
    const hr = Math.floor(ms / 3_600_000);
    let h = hr;
    let m = Math.round((ms - hr * 3_600_000) / 60_000);
    if (m === 60) {
      h += 1;
      m = 0;
    }
    if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    // rounded up to a full day - fall through to the day tier.
  }
  const day = Math.floor(ms / 86_400_000);
  let d = day;
  let h = Math.round((ms - day * 86_400_000) / 3_600_000);
  if (h === 24) {
    d += 1;
    h = 0;
  }
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}
