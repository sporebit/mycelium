-- 0054 — Drop the ghost CHECK constraint on workout_programme_sessions.slot.
--
-- Migration 0035 tried to drop the original 2-value slot constraint and
-- replace it with the 4-value _slot_chk. But the original had already
-- been widened to 3 values (morning/afternoon/evening) by an earlier
-- change, so the ILIKE pattern (which excluded definitions containing
-- 'evening') missed it. Both constraints coexisted: _slot_check blocked
-- 'extra', making the intended 4-value constraint useless.

ALTER TABLE workout_programme_sessions
  DROP CONSTRAINT IF EXISTS workout_programme_sessions_slot_check;
