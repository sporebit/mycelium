ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS google_event_id text;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS google_event_id text;

ALTER TABLE drops
  ADD COLUMN IF NOT EXISTS google_event_id text;
