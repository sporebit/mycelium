-- Ensure uniqueness for ON CONFLICT
ALTER TABLE supplements ADD CONSTRAINT supplements_user_name_uq UNIQUE (user_id, name);

-- Seed Luke's supplement schedule using the existing user_id
WITH uid AS (SELECT DISTINCT user_id FROM supplements LIMIT 1)

INSERT INTO supplements (user_id, name, dose, form, timing_slot, fasted, with_food, timing_notes, active)
SELECT uid.user_id, v.name, v.dose, v.form, v.timing_slot, v.fasted, v.with_food, v.timing_notes, true
FROM uid, (VALUES
  -- Wake (AM) — Fasted
  ('Lisdexamfetamine', '1 capsule', 'capsule', 'wake', true, false,
   'Water only. Wait 30-60 mins before food. Avoid carbs around yohimbine.'),
  ('Yohimbine', '1 capsule', 'capsule', 'wake', true, false,
   'Water only. Wait 30-60 mins before food. Avoid carbs around yohimbine.'),

  -- Breakfast (AM) — With food (include fats)
  ('Finasteride', '1 tablet', 'tablet', 'breakfast', false, true, NULL),
  ('Minoxidil', '1 dose (if oral)', 'tablet', 'breakfast', false, true, NULL),
  ('Vitamin D3', '1 capsule', 'capsule', 'breakfast', false, true, NULL),
  ('Cod Liver Oil', '1 capsule', 'capsule', 'breakfast', false, true, NULL),
  ('Beta Carotene', '1 capsule', 'capsule', 'breakfast', false, true, NULL),
  ('Turmeric', '1 capsule', 'capsule', 'breakfast', false, true,
   'Fat improves absorption.'),
  ('Glucosamine Sulphate', '1 capsule', 'capsule', 'breakfast', false, true, NULL),
  ('Vitamin B12', '1 tablet', 'tablet', 'breakfast', false, true,
   'B12 + maca better earlier.'),
  ('Maca Root', '1 capsule', 'capsule', 'breakfast', false, true,
   'Better earlier in the day.'),
  ('Milk Thistle', '1 capsule', 'capsule', 'breakfast', false, true, NULL),

  -- Midday/Afternoon — Flexible
  ('Vitamin C', '1 capsule', 'capsule', 'midday', false, false,
   'Keeps it away from stimulant window.'),

  -- Dinner (PM) — With food
  ('Tadalafil', '1 tablet', 'tablet', 'dinner', false, true,
   'Take same time daily for consistency.'),
  ('Minoxidil (topical 2nd dose)', '1 application', 'spray', 'dinner', false, false,
   '2nd dose if using topical. Same time as Tadalafil daily.'),

  -- Before Bed (30-60 min prior) — Empty/light stomach
  ('Magnesium Glycinate', '1-2 capsules', 'capsule', 'before_bed', true, false,
   'Helps sleep onset and relaxation. Take consistently.'),
  ('Melatonin', '1 tablet', 'tablet', 'before_bed', true, false,
   'Helps sleep onset and relaxation.'),

  -- Any Time
  ('Creatine', '5g', 'powder', 'any_time', false, false,
   'Daily consistency > timing.')
) AS v(name, dose, form, timing_slot, fasted, with_food, timing_notes)
ON CONFLICT (user_id, name) DO NOTHING;
