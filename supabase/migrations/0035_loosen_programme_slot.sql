-- 0035 — Loosen the legacy CHECK on workout_programme_sessions.slot.
--
-- Migration 0005 constrained slot to ('morning','afternoon'). The
-- new programme editor (with workouts library) presents four slots
-- per day — morning / afternoon / evening / extra. Picking a workout
-- for an evening or extra slot triggers the CHECK constraint and
-- the POST silently fails — visible to the user as the picker
-- "doing nothing on click". Drop the old constraint and replace
-- with the canonical four-slot allow-list.

DO $$
DECLARE
  cname text;
BEGIN
  -- Find the auto-named slot CHECK without hard-coding its name.
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'workout_programme_sessions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%slot%morning%afternoon%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%evening%';
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
    WHERE conname = 'workout_programme_sessions_slot_chk'
  ) THEN
    ALTER TABLE workout_programme_sessions
      ADD CONSTRAINT workout_programme_sessions_slot_chk
      CHECK (slot IN ('morning','afternoon','evening','extra'));
  END IF;
END $$;
