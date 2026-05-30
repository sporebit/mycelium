-- Migration: seed the 'other' session type.
--
-- workout_session_types already exists from migration 0009 with seven
-- seeded built-ins (gym_workout, gym_class, pt_session, home_workout,
-- hiking, walk, skipping). The R4 spec listed `other` alongside those
-- as a default — it wasn't seeded originally. This migration adds it
-- so the AddSessionModal's type dropdown has a stable "Other" sentinel
-- the user can pick before opening the custom-label entry.
--
-- Depends on: 0009 (workout_session_types).
-- Rollback: DELETE FROM workout_session_types
--             WHERE user_id='phil' AND type_key='other';

insert into workout_session_types
  (user_id, type_key, label, is_builtin, typical_logging_mode)
values
  ('phil', 'other', 'Other', true, 'simple')
on conflict (user_id, type_key) do nothing;
