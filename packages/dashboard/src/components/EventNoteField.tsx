/**
 * #336: a personal-note text field shown in every Timeline event drawer.
 *
 * Reads the operator's notes map from the shared `['event-notes']` query
 * and auto-saves the note for this event's stable `<kind>:<key>` id when
 * the field loses focus. Clearing it deletes the note server-side.
 */

import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';

export function EventNoteField({ eventKey }: { eventKey: string }) {
  const qc = useQueryClient();
  const notesQuery = useQuery({ queryKey: ['event-notes'], queryFn: () => api.eventNotes() });
  const saved = notesQuery.data?.notes[eventKey] ?? '';

  const [value, setValue] = useState(saved);
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Adopt the saved value once it loads (or when switching to a different
  // event), but never clobber what the operator is actively typing.
  useEffect(() => {
    if (!focused) setValue(saved);
  }, [saved, focused]);

  const mutation = useMutation({
    mutationFn: (note: string) => api.setEventNote(eventKey, note),
    onMutate: () => setStatus('saving'),
    onSuccess: (res) => {
      qc.setQueryData<{ notes: Record<string, string> }>(['event-notes'], (prev) => {
        const notes = { ...(prev?.notes ?? {}) };
        if (res.note) notes[eventKey] = res.note;
        else delete notes[eventKey];
        return { notes };
      });
      setStatus('saved');
    },
    onError: () => setStatus('idle'),
  });

  const commit = () => {
    setFocused(false);
    if (value.trim() === saved.trim()) return;
    mutation.mutate(value);
  };

  return (
    <div className="mt-3">
      <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-2">
        <Trans>Your note</Trans>
        {status === 'saving' && <span className="normal-case text-slate-500">…</span>}
        {status === 'saved' && (
          <span className="normal-case text-emerald-400">
            <Trans>saved</Trans>
          </span>
        )}
      </label>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus('idle');
        }}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        rows={2}
        placeholder={t`Add a personal note (saved when you click away)`}
        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-amber-400 focus:outline-none resize-y"
      />
    </div>
  );
}
