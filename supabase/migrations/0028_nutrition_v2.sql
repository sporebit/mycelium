-- 0028 — Nutrition v2: foods, meal_groups, nutrition_logs.
--
-- Replaces the legacy "meals in daily_logs.notes JSON" model with a real
-- relational store: a per-user food library (cached from Open Food Facts
-- or hand-entered), user-named meal groups (Breakfast / Lunch / …), and
-- a log table that snapshots the food's panel at log time so later edits
-- to the food don't retroactively rewrite history.

CREATE TABLE IF NOT EXISTS foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  brand text,
  barcode text,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('open_food_facts', 'manual', 'usda')),
  off_id text,
  serving_size_g numeric NOT NULL DEFAULT 100,
  serving_unit text NOT NULL DEFAULT 'g',
  servings jsonb NOT NULL DEFAULT '[]'::jsonb,
  kcal_per_100g numeric,
  protein_per_100g numeric,
  carbs_per_100g numeric,
  fat_per_100g numeric,
  fibre_per_100g numeric,
  sugar_per_100g numeric,
  saturated_fat_per_100g numeric,
  salt_per_100g numeric,
  sodium_per_100g numeric,
  energy_kj_per_100g numeric,
  polyunsaturated_fat_per_100g numeric,
  monounsaturated_fat_per_100g numeric,
  trans_fat_per_100g numeric,
  cholesterol_per_100g numeric,
  vitamin_a_per_100g numeric,
  vitamin_c_per_100g numeric,
  calcium_per_100g numeric,
  iron_per_100g numeric,
  potassium_per_100g numeric,
  is_favourite boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE foods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON foods;
CREATE POLICY "deny all" ON foods AS RESTRICTIVE USING (false);

-- One cached row per (user, off_id) and (user, barcode) so subsequent
-- lookups upsert in place rather than duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS foods_user_off_id_idx
  ON foods (user_id, off_id) WHERE off_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS foods_user_barcode_idx
  ON foods (user_id, barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS foods_user_id_idx ON foods (user_id);
CREATE INDEX IF NOT EXISTS foods_barcode_idx ON foods (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS foods_use_count_idx ON foods (user_id, use_count DESC);

CREATE TABLE IF NOT EXISTS meal_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE meal_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON meal_groups;
CREATE POLICY "deny all" ON meal_groups AS RESTRICTIVE USING (false);

-- Seed the 4 standard groups for whichever user_id is configured. If the
-- env var isn't readable at migrate time the seed is a no-op — it'll be
-- re-tried by app code on first access.
DO $$
DECLARE
  uid text := current_setting('app.user_id', true);
BEGIN
  IF uid IS NULL OR uid = '' THEN
    uid := 'phil';
  END IF;
  INSERT INTO meal_groups (user_id, name, position) VALUES
    (uid, 'Breakfast', 0),
    (uid, 'Lunch', 1),
    (uid, 'Dinner', 2),
    (uid, 'Snacks', 3)
  ON CONFLICT (user_id, name) DO NOTHING;
END $$;

CREATE TABLE IF NOT EXISTS nutrition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  food_id uuid REFERENCES foods(id) ON DELETE SET NULL,
  meal_group_id uuid REFERENCES meal_groups(id) ON DELETE SET NULL,
  date date NOT NULL,
  food_name text NOT NULL,
  brand text,
  quantity_g numeric NOT NULL,
  serving_label text,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fibre_g numeric,
  sugar_g numeric,
  saturated_fat_g numeric,
  salt_g numeric,
  extended_nutrients jsonb,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nutrition_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON nutrition_logs;
CREATE POLICY "deny all" ON nutrition_logs AS RESTRICTIVE USING (false);

CREATE INDEX IF NOT EXISTS nutrition_logs_user_date_idx ON nutrition_logs (user_id, date);
CREATE INDEX IF NOT EXISTS nutrition_logs_meal_group_idx ON nutrition_logs (meal_group_id);
