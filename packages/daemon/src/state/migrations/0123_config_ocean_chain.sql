-- #363: which Ocean sharelog the daemon follows. Since the 8/8/2026
-- chain split Ocean runs dual TIDES accounting; 'mainstream' reads
-- the JSON API at api.ocean.xyz, 'bip110' scrapes bip110.ocean.xyz
-- (which has no JSON API). Default preserves existing behaviour.

ALTER TABLE config ADD COLUMN ocean_chain TEXT NOT NULL DEFAULT 'mainstream'
  CHECK (ocean_chain IN ('mainstream', 'bip110'));
