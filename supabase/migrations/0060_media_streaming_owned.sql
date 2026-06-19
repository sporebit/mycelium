-- Streaming availability + ownership flag for media items.
ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS owned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS streaming_services jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS streaming_checked_at timestamptz DEFAULT NULL;
