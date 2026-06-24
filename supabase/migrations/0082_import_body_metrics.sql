-- Add hip column
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS hip_in numeric;

-- Import Luke's check-in history
WITH uid AS (SELECT DISTINCT user_id FROM body_metrics LIMIT 1)
INSERT INTO body_metrics (user_id, date, weight, weight_unit, waist_cm, hip_in, arms_in, thighs_in, source)
SELECT uid.user_id, v.dt, v.weight, 'lbs', v.waist_cm, v.hip_in, v.arms_in, v.thighs_in, 'manual'
FROM uid, (VALUES
  ('2026-01-17'::date, 181.0,   81.28, 83.82, NULL::numeric, NULL::numeric),
  ('2026-01-24'::date, 176.0,   81.28, 86.36, 13.0,  21.5),
  ('2026-01-31'::date, 176.8,   81.28, 86.36, 13.0,  23.0),
  ('2026-02-07'::date, 175.9,   81.28, 83.82, NULL,   NULL),
  ('2026-02-14'::date, 173.28,  81.28, 83.82, NULL,   NULL),
  ('2026-02-21'::date, 195.0,   81.28, 83.82, NULL,   NULL),
  ('2026-02-28'::date, 197.6,   81.28, 83.82, NULL,   NULL),
  ('2026-03-07'::date, 183.2,   81.28, 86.36, NULL,   NULL),
  ('2026-03-14'::date, 178.2,   81.28, 83.82, NULL,   NULL),
  ('2026-03-21'::date, 177.4,   81.28, 83.82, NULL,   NULL),
  ('2026-03-28'::date, 178.8,   81.28, 86.36, NULL,   NULL),
  ('2026-04-04'::date, 179.6,   81.28, 83.82, NULL,   NULL),
  ('2026-04-11'::date, 180.2,   81.28, 83.82, NULL,   NULL),
  ('2026-04-18'::date, 181.2,   81.28, 83.82, NULL,   NULL),
  ('2026-04-25'::date, 179.6,   81.28, 83.82, NULL,   NULL)
) AS v(dt, weight, waist_cm, hip_in, arms_in, thighs_in)
ON CONFLICT (user_id, date) DO NOTHING;
