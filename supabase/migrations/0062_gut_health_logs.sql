CREATE TABLE gut_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_at timestamptz NOT NULL DEFAULT now(),
  bristol_type smallint NOT NULL CHECK (bristol_type BETWEEN 1 AND 7),
  time_of_day text CHECK (time_of_day IN ('morning','midday','afternoon','evening','night')),
  felt_finished boolean DEFAULT null,
  wipe_type text CHECK (wipe_type IN ('clean','few_wipes','many_wipes','skid_marks')),
  pain smallint CHECK (pain BETWEEN 0 AND 10),
  blood boolean DEFAULT false,
  urgent boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);
