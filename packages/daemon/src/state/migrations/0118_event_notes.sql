-- #336: operator's personal notes attached to Timeline events.
--
-- Every Timeline row carries a stable `<kind>:<key>` identity (the same
-- one the chart <-> timeline jump uses), e.g. `payout:<id>`,
-- `deposit:<txid>`, `block:<blockhash>`, `boot:<id>`, and bid events /
-- alert spans by their ids. A note is keyed on that string, so one note
-- maps to one event regardless of its source type. Clearing the text
-- deletes the row (absence = no note).
CREATE TABLE event_notes (
  event_key TEXT PRIMARY KEY,
  note TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
