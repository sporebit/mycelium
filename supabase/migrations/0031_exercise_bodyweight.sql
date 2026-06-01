-- 0031 — Bodyweight flag on logged + templated exercises.
--
-- Pull-ups, dips, push-ups etc. log "added weight" on top of bodyweight;
-- the flag lets the set-row UI swap the "WEIGHT" column header to
-- "+ KG" and render empty values as "BW" instead of "—". Templates
-- carry the same flag so a programme exercise marked bodyweight
-- propagates to every started session.

ALTER TABLE workout_session_exercises
  ADD COLUMN IF NOT EXISTS is_bodyweight boolean NOT NULL DEFAULT false;

ALTER TABLE workout_programme_exercises
  ADD COLUMN IF NOT EXISTS is_bodyweight boolean NOT NULL DEFAULT false;
