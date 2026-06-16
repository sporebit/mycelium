-- Add optional scheduled date/time to tasks.
-- Stored as timestamptz (UTC) so calendar integrations get a precise instant.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_at timestamptz DEFAULT NULL;
