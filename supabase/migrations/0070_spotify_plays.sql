CREATE TABLE IF NOT EXISTS spotify_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL,
  track_name text NOT NULL,
  artist_names text NOT NULL,
  album_name text,
  album_art_url text,
  duration_ms integer,
  played_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(track_id, played_at)
);

CREATE INDEX IF NOT EXISTS spotify_plays_played_at_idx
  ON spotify_plays (played_at DESC);
