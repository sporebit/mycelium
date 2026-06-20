CREATE TABLE recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_url text,
  source_name text,
  image_url text,
  prep_time_minutes integer,
  cook_time_minutes integer,
  servings integer DEFAULT 4,
  ingredients jsonb NOT NULL DEFAULT '[]',
  method jsonb NOT NULL DEFAULT '[]',
  tags text[] DEFAULT '{}',
  cuisine text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Shopping List',
  items jsonb NOT NULL DEFAULT '[]',
  week_start date,
  sent_to_telegram boolean DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE meal_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_date date NOT NULL,
  meal_type text CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL,
  custom_meal text,
  servings integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);
