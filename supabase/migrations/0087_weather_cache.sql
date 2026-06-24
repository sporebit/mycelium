CREATE TABLE weather_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL DEFAULT 'Doncaster,UK',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  forecast jsonb NOT NULL
);
