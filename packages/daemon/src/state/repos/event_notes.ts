/**
 * #336: operator's personal notes on Timeline events. A note is keyed by
 * the row's stable `<kind>:<key>` identity (the same string the chart
 * <-> timeline jump uses), so one note maps to one event regardless of
 * its source type. Clearing the text deletes the row - absence means "no
 * note".
 */

import type { Kysely } from 'kysely';

import type { Database } from '../types.js';

export class EventNotesRepo {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** All notes as an `{ event_key: note }` map (small - one row per annotated event). */
  async all(): Promise<Record<string, string>> {
    const rows = await this.db.selectFrom('event_notes').select(['event_key', 'note']).execute();
    const out: Record<string, string> = {};
    for (const r of rows) out[r.event_key] = r.note;
    return out;
  }

  async get(eventKey: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('event_notes')
      .select('note')
      .where('event_key', '=', eventKey)
      .executeTakeFirst();
    return row?.note ?? null;
  }

  /**
   * Upsert a note. An empty (or whitespace-only) note deletes the row.
   * Returns the stored note ('' when deleted).
   */
  async set(eventKey: string, note: string): Promise<string> {
    const trimmed = note.trim();
    if (trimmed === '') {
      await this.db.deleteFrom('event_notes').where('event_key', '=', eventKey).execute();
      return '';
    }
    const now = this.now();
    await this.db
      .insertInto('event_notes')
      .values({ event_key: eventKey, note: trimmed, updated_at: now })
      .onConflict((oc) => oc.column('event_key').doUpdateSet({ note: trimmed, updated_at: now }))
      .execute();
    return trimmed;
  }
}
