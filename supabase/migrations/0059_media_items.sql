-- Watch / Listen / Read lists — media items tracked by status and rating.
CREATE TABLE IF NOT EXISTS media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title text NOT NULL,
  creator text,                          -- author / director / artist
  media_type text NOT NULL CHECK (media_type IN ('watch', 'listen', 'read')),
  media_status text NOT NULL DEFAULT 'backlog' CHECK (media_status IN ('backlog', 'in_progress', 'completed', 'dropped')),
  rating smallint CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  notes text,
  tags text[],
  url text,                              -- link to the media (optional)
  raw_capture_id uuid REFERENCES raw_captures(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all" ON media_items AS RESTRICTIVE USING (false);

CREATE INDEX IF NOT EXISTS media_items_user_type_idx ON media_items (user_id, media_type);
CREATE INDEX IF NOT EXISTS media_items_user_status_idx ON media_items (user_id, media_status);
