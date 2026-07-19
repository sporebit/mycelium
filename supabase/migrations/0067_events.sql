CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean DEFAULT false,
  location text,
  notes text,
  colour text DEFAULT '#e8e6dd',
  created_at timestamptz DEFAULT now()
);
