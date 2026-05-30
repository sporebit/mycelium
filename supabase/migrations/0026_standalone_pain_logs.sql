-- 0026 — allow standalone pain logs (not linked to a workout session)
--
-- R3c voice + iOS Shortcut adds a `pain_log` capture kind so users can
-- log pain outside of a workout (e.g. "my knee hurts"). These rows
-- need session_id = NULL so they don't synthesise a phantom workout.
--
-- Depends on: 0022 (exercise_pain_logs schema).

alter table exercise_pain_logs
  alter column session_id drop not null;

create index if not exists pain_logs_user_logged_at_idx
  on exercise_pain_logs (user_id, logged_at desc);
