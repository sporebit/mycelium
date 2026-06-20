CREATE TABLE media_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  title text NOT NULL,
  episode_number integer,
  season_number integer,
  duration_minutes integer,
  listened_at timestamptz,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  comments text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS review text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
