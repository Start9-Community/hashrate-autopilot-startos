/**
 * #336: operator's personal notes on Timeline events.
 *
 * - GET  /api/event-notes        -> { notes: { <event_key>: <note> } }
 * - PUT  /api/event-notes/:key   -> upsert; an empty note deletes it.
 *
 * `event_key` is the Timeline row's stable `<kind>:<key>` id (e.g.
 * `deposit:<txid>`, `block:<blockhash>`); the client URL-encodes it.
 * All notes fit in one small map, so the Timeline fetches them once and
 * looks up per row (and folds them into the Excel export).
 */

import type { FastifyInstance } from 'fastify';

import type { HttpServerDeps } from '../server.js';

export async function registerEventNotesRoutes(
  app: FastifyInstance,
  deps: HttpServerDeps,
): Promise<void> {
  app.get('/api/event-notes', async (): Promise<{ notes: Record<string, string> }> => {
    return { notes: await deps.eventNotesRepo.all() };
  });

  app.put<{ Params: { key: string }; Body: { note?: string } }>(
    '/api/event-notes/:key',
    async (req): Promise<{ event_key: string; note: string }> => {
      const key = req.params.key;
      const note = typeof req.body?.note === 'string' ? req.body.note : '';
      const stored = await deps.eventNotesRepo.set(key, note);
      return { event_key: key, note: stored };
    },
  );
}
