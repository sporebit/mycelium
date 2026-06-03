-- Migration: add client_uuid columns for offline-first idempotency.
-- Strictly additive: nullable columns + unique constraints only.

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS client_uuid text;

CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_client_uuid_key
  ON workout_sessions (client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE workout_session_exercises
  ADD COLUMN IF NOT EXISTS client_uuid text;

CREATE UNIQUE INDEX IF NOT EXISTS workout_session_exercises_client_uuid_key
  ON workout_session_exercises (client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE workout_sets
  ADD COLUMN IF NOT EXISTS client_uuid text;

CREATE UNIQUE INDEX IF NOT EXISTS workout_sets_client_uuid_key
  ON workout_sets (client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE raw_captures
  ADD COLUMN IF NOT EXISTS client_uuid text;

CREATE UNIQUE INDEX IF NOT EXISTS raw_captures_client_uuid_key
  ON raw_captures (client_uuid) WHERE client_uuid IS NOT NULL;
