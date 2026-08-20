-- #363: record which Ocean sharelog each tick's Ocean reading came
-- from. Since the 8/8/2026 chain split Ocean runs dual TIDES
-- accounting (mainstream vs BIP110 chain) and the daemon can be
-- pointed at either via the new `ocean_chain` config key.
--
-- Without this column a chain flip creates a discontinuity in the
-- ocean_unpaid_sat series that the deduced-payouts scanner (#343)
-- would read as a payout: e.g. flipping from a BIP110 balance of
-- 0.19 BTC back to a mainstream balance of 0.009 BTC looks exactly
-- like a 95% drop below the payout-threshold residual and would mint
-- a phantom "Lightning" payout on every full-history pass. The drop
-- scan now partitions its LAG/LEAD window by this column, so readings
-- from different chains never become neighbours.
--
-- NULL means "recorded before this feature existed", which is
-- historically always the mainstream chain - readers COALESCE to
-- 'mainstream'.

ALTER TABLE tick_metrics ADD COLUMN ocean_chain TEXT;
