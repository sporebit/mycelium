-- Migration: extend exercise_pain_logs to match the R3b spec.
--
-- exercise_pain_logs already exists from migration 0007 — this is an
-- additive ALTER, not a fresh CREATE TABLE. The deltas:
--   - session_id, exercise_name, logged_at columns (denormalised so
--     queries by session or by exercise don't need a join through
--     workout_session_exercises every time)
--   - severity becomes NOT NULL (was nullable)
--   - pain_regions becomes NOT NULL DEFAULT '{}' (was nullable)
--   - session_exercise_id becomes nullable so we can store
--     session-level pain notes with session_exercise_id = NULL
--   - new indexes per spec
--
-- Depends on: 0007 (exercise_pain_logs), workout_sessions.
-- Rollback:
--   ALTER TABLE exercise_pain_logs
--     DROP COLUMN session_id, DROP COLUMN exercise_name, DROP COLUMN logged_at;
--   DROP INDEX IF EXISTS pain_logs_user_exercise_idx;
--   DROP INDEX IF EXISTS pain_logs_session_idx;

-- New columns. session_id is filled via backfill below; we add it as
-- nullable so existing rows are valid during the ALTER, then NOT NULL.
alter table exercise_pain_logs
  add column if not exists session_id    uuid references workout_sessions(id) on delete cascade,
  add column if not exists exercise_name text,
  add column if not exists logged_at     timestamptz not null default now();

-- Backfill new columns from the existing join chain. Idempotent — only
-- touches rows where the new fields are still NULL.
update exercise_pain_logs as l
   set session_id    = e.session_id,
       exercise_name = e.name
  from workout_session_exercises as e
 where l.session_exercise_id is not null
   and e.id = l.session_exercise_id
   and (l.session_id is null or l.exercise_name is null);

-- For session-level (synthetic, none exist yet) the backfill leaves
-- those rows alone — going forward writers handle these explicitly.
update exercise_pain_logs
   set logged_at = created_at
 where logged_at is null
   and created_at is not null;

-- Now lock down the constraints.
alter table exercise_pain_logs
  alter column session_id set not null;

alter table exercise_pain_logs
  alter column exercise_name set not null;

-- Allow NULL on session_exercise_id so session-level rows
-- (session_exercise_id=NULL, exercise_name='session') can be stored.
alter table exercise_pain_logs
  alter column session_exercise_id drop not null;

-- Severity becomes required. The pre-existing CHECK already enforces
-- 0..10 — this just stops accepting NULLs.
update exercise_pain_logs set severity = 0 where severity is null;
alter table exercise_pain_logs
  alter column severity set not null;

-- pain_regions becomes NOT NULL with default '{}' so callers don't
-- have to coerce nulls in the UI.
update exercise_pain_logs set pain_regions = '{}' where pain_regions is null;
alter table exercise_pain_logs
  alter column pain_regions set default '{}',
  alter column pain_regions set not null;

-- New indexes per spec.
create index if not exists pain_logs_user_exercise_idx
  on exercise_pain_logs (user_id, exercise_name);
create index if not exists pain_logs_session_idx
  on exercise_pain_logs (session_id);
