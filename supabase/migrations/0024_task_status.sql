-- 0024 — task status column for the 10-column kanban
--
-- Adds a `status` field to tasks with a CHECK constraint over the ten
-- workflow states. Backfills existing rows from `completed_at`:
--   completed_at NOT NULL → 'completed'
--   completed_at NULL     → 'new'
--
-- The application-level dnd handler keeps `completed_at` and `status`
-- in sync (drag to Completed sets completed_at = now(); drag away
-- clears it).

ALTER TABLE tasks
  ADD COLUMN status text NOT NULL DEFAULT 'new'
  CHECK (status IN (
    'new', 'in_progress', 'blocked', 'on_hold',
    'waiting_third_party', 'review', 'pending_review',
    'testing', 'completed', 'cancelled'
  ));

UPDATE tasks SET status = 'completed' WHERE completed_at IS NOT NULL;
UPDATE tasks SET status = 'new'       WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS tasks_user_status_idx
  ON tasks (user_id, status);
