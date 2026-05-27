-- ---------------------------------------------------------------------------
-- Pending workout routes: add short_id column for Telegram callback lookup.
--   Postgres can't run LIKE against uuid, so the previous prefix lookup
--   silently failed. Generated short_id keeps the 8-char prefix as text and
--   is the lookup column used by findPendingByPrefix.
-- ---------------------------------------------------------------------------

ALTER TABLE pending_workout_routes
  ADD COLUMN short_id text
  GENERATED ALWAYS AS (substring(id::text, 1, 8)) STORED;

CREATE INDEX IF NOT EXISTS pending_workout_routes_short_id_idx
  ON pending_workout_routes (short_id);
