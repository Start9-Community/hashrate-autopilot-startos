import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase, type DatabaseHandle } from '../db.js';
import { EventNotesRepo } from './event_notes.js';

describe('EventNotesRepo (#336)', () => {
  let handle: DatabaseHandle;
  let repo: EventNotesRepo;

  beforeEach(async () => {
    handle = await openDatabase({ path: ':memory:' });
    repo = new EventNotesRepo(handle.db, () => 1000);
  });
  afterEach(async () => {
    await closeDatabase(handle);
  });

  it('starts empty', async () => {
    expect(await repo.all()).toEqual({});
    expect(await repo.get('deposit:x')).toBeNull();
  });

  it('upserts and reads back a note', async () => {
    await repo.set('deposit:abc', 'wired funds here');
    expect(await repo.get('deposit:abc')).toBe('wired funds here');
    expect(await repo.all()).toEqual({ 'deposit:abc': 'wired funds here' });
  });

  it('updates an existing note in place (one row per key)', async () => {
    await repo.set('block:h', 'first');
    await repo.set('block:h', 'second');
    expect(await repo.get('block:h')).toBe('second');
    expect(Object.keys(await repo.all())).toHaveLength(1);
  });

  it('trims, and an empty note deletes the row', async () => {
    await repo.set('payout:1', '  spaced  ');
    expect(await repo.get('payout:1')).toBe('spaced');
    expect(await repo.set('payout:1', '   ')).toBe('');
    expect(await repo.get('payout:1')).toBeNull();
    expect(await repo.all()).toEqual({});
  });
});
