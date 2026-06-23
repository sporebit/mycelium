-- Expand meal_type to support 6 rows: breakfast, lunch, dinner, evening_meal, snack_1, snack_2
ALTER TABLE meal_plan DROP CONSTRAINT IF EXISTS meal_plan_meal_type_check;
ALTER TABLE meal_plan ADD CONSTRAINT meal_plan_meal_type_check
  CHECK (meal_type IN ('breakfast','lunch','dinner','evening_meal','snack_1','snack_2','snack'));

-- Card ordering for draggable overview grids
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS card_orders jsonb DEFAULT '{}'::jsonb;
