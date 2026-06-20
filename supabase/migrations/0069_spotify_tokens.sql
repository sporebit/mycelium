CREATE TABLE spotify_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scopes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
