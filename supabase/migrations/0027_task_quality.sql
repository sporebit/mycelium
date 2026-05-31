-- 0027 — Task quality pass: comments + activity log + due-date index.
--
-- `description`, `due_date`, `time_estimate_min` already exist on tasks
-- (see 0001_init.sql), so the brief's ADD COLUMN steps for those are
-- safe-skipped with IF NOT EXISTS. The new artifacts are two child
-- tables for comments and the audit log, plus a partial index over
-- due_date for the calendar view's "tasks with a date" lookup.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS time_estimate_min integer;

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON task_comments;
CREATE POLICY "deny all" ON task_comments AS RESTRICTIVE USING (false);

CREATE TABLE IF NOT EXISTS task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  action text NOT NULL,
  from_value text,
  to_value text,
  field text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON task_activity;
CREATE POLICY "deny all" ON task_activity AS RESTRICTIVE USING (false);

CREATE INDEX IF NOT EXISTS task_comments_task_id_idx ON task_comments (task_id);
CREATE INDEX IF NOT EXISTS task_activity_task_id_idx ON task_activity (task_id);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks (due_date) WHERE due_date IS NOT NULL;
