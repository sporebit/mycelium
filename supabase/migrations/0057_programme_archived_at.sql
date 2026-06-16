-- 0057 — Add archived_at to workout_programmes.
-- (workouts table already has archived_at from the original schema.)

ALTER TABLE workout_programmes
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;
