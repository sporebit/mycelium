-- 0030 — Context fields: where / device / energy / context_tag.
--
-- Adds four context columns to every action-style record + a user
-- extensible options registry. The voice classifier and the
-- post-create suggester both fill these; the ContextSwitcher header
-- widget and the NOW filter both read them.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS context_where text,
  ADD COLUMN IF NOT EXISTS context_device text,
  ADD COLUMN IF NOT EXISTS context_energy text,
  ADD COLUMN IF NOT EXISTS context_tag text;
-- Enforce the energy domain in a follow-up so IF NOT EXISTS works
-- consistently across reruns. ADD CONSTRAINT IF NOT EXISTS doesn't
-- exist in Postgres < 16, so guard with a NOT VALID + DO block.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_context_energy_chk'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_context_energy_chk
      CHECK (context_energy IS NULL OR context_energy IN ('low','medium','high'));
  END IF;
END $$;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS context_where text,
  ADD COLUMN IF NOT EXISTS context_device text,
  ADD COLUMN IF NOT EXISTS context_energy text,
  ADD COLUMN IF NOT EXISTS context_tag text;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_context_energy_chk'
  ) THEN
    ALTER TABLE purchases
      ADD CONSTRAINT purchases_context_energy_chk
      CHECK (context_energy IS NULL OR context_energy IN ('low','medium','high'));
  END IF;
END $$;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS context_where text,
  ADD COLUMN IF NOT EXISTS context_device text,
  ADD COLUMN IF NOT EXISTS context_energy text,
  ADD COLUMN IF NOT EXISTS context_tag text;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_context_energy_chk'
  ) THEN
    ALTER TABLE journal_entries
      ADD CONSTRAINT journal_entries_context_energy_chk
      CHECK (context_energy IS NULL OR context_energy IN ('low','medium','high'));
  END IF;
END $$;

-- raw_captures stores decision/note/capture; same context fields apply.
ALTER TABLE raw_captures
  ADD COLUMN IF NOT EXISTS context_where text,
  ADD COLUMN IF NOT EXISTS context_device text,
  ADD COLUMN IF NOT EXISTS context_energy text,
  ADD COLUMN IF NOT EXISTS context_tag text;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'raw_captures_context_energy_chk'
  ) THEN
    ALTER TABLE raw_captures
      ADD CONSTRAINT raw_captures_context_energy_chk
      CHECK (context_energy IS NULL OR context_energy IN ('low','medium','high'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS context_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  field text NOT NULL
    CHECK (field IN ('where', 'device', 'context_tag')),
  value text NOT NULL,
  label text NOT NULL,
  icon text,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, field, value)
);

ALTER TABLE context_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON context_options;
CREATE POLICY "deny all" ON context_options AS RESTRICTIVE USING (false);

CREATE INDEX IF NOT EXISTS context_options_user_field_idx
  ON context_options (user_id, field, use_count DESC);

-- Seed sensible defaults for the configured user. The DO block grabs
-- USER_ID from app.user_id or falls back to 'phil' so the migration
-- works locally without env wiring.
DO $$
DECLARE
  uid text := current_setting('app.user_id', true);
BEGIN
  IF uid IS NULL OR uid = '' THEN
    uid := 'phil';
  END IF;
  INSERT INTO context_options (user_id, field, value, label, icon) VALUES
    (uid, 'where', 'home', 'Home', '🏠'),
    (uid, 'where', 'office', 'Office', '💼'),
    (uid, 'where', 'mobile', 'Out & About', '🚶'),
    (uid, 'where', 'gym', 'Gym', '🏋️'),
    (uid, 'where', 'anywhere', 'Anywhere', '✨'),
    (uid, 'device', 'pc', 'PC', '🖥️'),
    (uid, 'device', 'phone', 'Phone', '📱'),
    (uid, 'device', 'tablet', 'Tablet', '🪟'),
    (uid, 'device', 'none', 'No device', '🌿'),
    (uid, 'context_tag', 'focused', 'Focused Work', '🎯'),
    (uid, 'context_tag', 'errand', 'Errand', '🛒'),
    (uid, 'context_tag', 'call', 'Call', '📞'),
    (uid, 'context_tag', 'admin', 'Admin', '📋'),
    (uid, 'context_tag', 'creative', 'Creative', '🎨'),
    (uid, 'context_tag', 'physical', 'Physical', '💪')
  ON CONFLICT (user_id, field, value) DO NOTHING;
END $$;

-- Helpful index for the NOW filter on /compost/tasks.
CREATE INDEX IF NOT EXISTS tasks_context_idx
  ON tasks (user_id, context_where, context_device, context_energy)
  WHERE deleted_at IS NULL;
