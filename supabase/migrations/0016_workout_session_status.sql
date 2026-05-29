-- Migration: workout_sessions.status — explicit lifecycle field that
-- supplements (does not replace) completed_at.
--
-- States:
--   active     — started, not finished, < 48h old
--   completed  — completed_at IS NOT NULL
--   attempted  — started, not completed, ≥ 48h since started_at
--   abandoned  — manually marked as abandoned by the user
--
-- Depends on: 0005 (workout_sessions)
-- Rollback: ALTER TABLE workout_sessions DROP COLUMN status;

alter table workout_sessions
  add column if not exists status text not null default 'active'
    check (status in ('active', 'completed', 'attempted', 'abandoned'));

-- Backfill existing rows. The CHECK passes 'completed' first because
-- the second statement is broader and would otherwise tag completed
-- sessions as 'active'.
update workout_sessions set status = 'completed' where completed_at is not null;
update workout_sessions set status = 'active'
  where completed_at is null and status = 'active';

create index if not exists workout_sessions_status_idx
  on workout_sessions (user_id, status)
  where status in ('active', 'attempted');
