-- ---------------------------------------------------------------------------
-- Fitness Round 2: in-gym logging support.
-- Adds a `skipped` flag to session-exercises so we can keep the row in place
-- (with its original prescription) but mark it as deliberately not performed.
-- ---------------------------------------------------------------------------

alter table workout_session_exercises
  add column if not exists skipped boolean not null default false;

alter table workout_session_exercises
  add column if not exists completed_at timestamptz;

create index if not exists workout_session_ex_session_idx
  on workout_session_exercises(session_id, position);

create index if not exists workout_sets_session_ex_idx
  on workout_sets(session_exercise_id, set_number);
