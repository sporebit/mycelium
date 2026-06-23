ALTER TABLE supplements
  ADD COLUMN IF NOT EXISTS timing_slot text CHECK (timing_slot IN (
    'wake','breakfast','midday','dinner','before_bed','any_time'
  )),
  ADD COLUMN IF NOT EXISTS fasted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS with_food boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS timing_notes text;
