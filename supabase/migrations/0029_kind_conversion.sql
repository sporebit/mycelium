-- 0029 — Kind conversion: soft-delete + conversion lineage.
--
-- Any routable record (task, purchase, decision/note/capture, journal,
-- pain_log) can be reclassified post-hoc by soft-deleting the source
-- and inserting a new row of the target kind. converted_from records
-- the lineage as { from_kind, from_id, at }.
--
-- decision/note/capture live in raw_captures (no dedicated table), so
-- that table also receives the columns.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_from jsonb;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_from jsonb;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_from jsonb;

ALTER TABLE exercise_pain_logs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_from jsonb;

-- raw_captures stores decision/note/capture kinds; it also needs the
-- columns so conversion source-rows can be marked deleted.
ALTER TABLE raw_captures
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_from jsonb;

-- Partial indexes for the most common "active rows" filters.
CREATE INDEX IF NOT EXISTS tasks_active_idx
  ON tasks (user_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS purchases_active_idx
  ON purchases (user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS journal_active_idx
  ON journal_entries (user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS pain_logs_active_idx
  ON exercise_pain_logs (user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS raw_captures_active_idx
  ON raw_captures (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
