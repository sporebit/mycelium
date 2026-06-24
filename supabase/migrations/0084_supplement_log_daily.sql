-- Add date and timing_slot to supplement_logs for daily calendar view
ALTER TABLE supplement_logs ADD COLUMN date date;
ALTER TABLE supplement_logs ADD COLUMN timing_slot text
  CHECK (timing_slot IN ('wake', 'breakfast', 'midday', 'dinner', 'before_bed', 'any_time'));

-- Backfill date from taken_at using London timezone
UPDATE supplement_logs
SET date = (taken_at AT TIME ZONE 'Europe/London')::date
WHERE date IS NULL;

-- Backfill timing_slot from the parent supplement's default
UPDATE supplement_logs sl
SET timing_slot = s.timing_slot
FROM supplements s
WHERE sl.supplement_id = s.id
  AND sl.timing_slot IS NULL
  AND s.timing_slot IS NOT NULL;

-- Make date NOT NULL with default
ALTER TABLE supplement_logs ALTER COLUMN date SET NOT NULL;
ALTER TABLE supplement_logs ALTER COLUMN date SET DEFAULT CURRENT_DATE;

-- Fast daily lookups
CREATE INDEX IF NOT EXISTS idx_supplement_logs_user_date
  ON supplement_logs (user_id, date);
