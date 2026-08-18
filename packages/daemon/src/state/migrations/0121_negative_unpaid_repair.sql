-- #362: repair installs that stored a negative ocean_unpaid_sat and
-- minted a phantom deduced payout from it.
--
-- A negative unpaid balance is not physically possible, but the Ocean
-- snapshot parser only mapped NON-FINITE values to NULL, so a tiny
-- negative reading (rounding to -1 sat) was stored verbatim. A stored
-- negative satisfies every deduced-payout gate trivially - each one
-- bounds the reading from above only - and is absorbed into the payout
-- amount via `prev - cur`, so two consecutive negatives minted a
-- permanent "Lightning" payout for roughly the whole pre-drop balance.
-- Reported case: 679,776 -> -1 -> -1 -> 679,776 produced a 679,777 sat
-- phantom payout.
--
-- The user-facing hard reset could not clear it: deduced rows are
-- re-derived from tick_metrics on the next scan pass, and the reset
-- only wipes ocean_payouts.
--
-- ORDER MATTERS: the phantom rows are identified BY the negative
-- readings, so delete them before nulling those readings out.

-- Step 1: delete only the deduced rows a negative reading could have
-- produced. Deliberately targeted rather than "delete all deduced rows
-- and re-derive": Timeline notes are keyed `payout:<id>`, and a
-- re-derived row gets a fresh id, so a blanket rebuild would orphan the
-- notes on every legitimate deduced payout.
--
-- A deduced row's dedup_key is `<address>|dd:<drop_tick_at>`, so the
-- drop tick parses straight back out of it. The +/- 30 minute window is
-- the scanner's own cooldown: a payout Ocean surfaces in steps collapses
-- into one row whose amount spans the group, so a negative anywhere in
-- that group can inflate a row whose own drop tick is clean.
--
-- `deduced = 1` scopes this strictly to rows the scanner owns; real
-- earnpay settlements are never touched.
DELETE FROM ocean_payouts
WHERE deduced = 1
  AND EXISTS (
    SELECT 1
    FROM tick_metrics t
    WHERE t.ocean_unpaid_sat < 0
      AND ABS(
            t.tick_at
            - CAST(substr(dedup_key, instr(dedup_key, '|dd:') + 4) AS INTEGER)
          ) <= 1800000
  );

-- Step 2: drop the impossible readings themselves, so the corrected
-- scanner cannot re-derive from them. NULL means "unknown" to every
-- consumer, and the deduced scanner bridges over NULLs, so the series
-- closes up rather than splitting.
UPDATE tick_metrics
SET ocean_unpaid_sat = NULL
WHERE ocean_unpaid_sat < 0;
