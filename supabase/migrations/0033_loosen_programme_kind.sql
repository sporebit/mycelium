-- 0033 — Loosen the legacy CHECK on workout_programme_sessions.kind.
--
-- Migration 0005 constrained kind to ('cardio','resistance'). The
-- workouts library introduced in 0032 supports all four canonical
-- kinds (cardio / conditioning / resistance / mobility); when a user
-- picks a workout with default_kind = 'mobility' for a programme
-- slot, the POST currently fails the legacy CHECK and the picker
-- silently no-ops. Drop the old constraint and replace with the
-- canonical four-kind allow-list.

DO $$
DECLARE
  cname text;
BEGIN
  -- The original constraint name varies (Postgres auto-named it),
  -- so find it by table + column rather than hard-coding.
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'workout_programme_sessions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kind%cardio%resistance%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%kind_override%';
  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE workout_programme_sessions DROP CONSTRAINT %I',
      cname
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workout_programme_sessions_kind_chk'
  ) THEN
    ALTER TABLE workout_programme_sessions
      ADD CONSTRAINT workout_programme_sessions_kind_chk
      CHECK (kind IN ('cardio','conditioning','resistance','mobility'));
  END IF;
END $$;
