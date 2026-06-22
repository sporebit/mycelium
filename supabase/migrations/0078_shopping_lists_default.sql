ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS default_list boolean DEFAULT false;
