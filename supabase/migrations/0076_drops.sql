-- 0076 — Drops section: drops, wishlist, raffles, cook guides, monitors

CREATE TABLE drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand text NOT NULL,
  category text CHECK (category IN (
    'tee','hoodie','jacket','pants','shorts','accessory',
    'footwear','collab','bag','hat','other'
  )),
  drop_type text NOT NULL DEFAULT 'drop' CHECK (drop_type IN (
    'drop','raffle','restock','collab','exclusive'
  )),
  drop_date timestamptz,
  drop_date_confirmed boolean DEFAULT false,
  retail_price numeric,
  resale_price numeric,
  currency text DEFAULT 'GBP',
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN (
    'upcoming','live','ended','restocked'
  )),
  image_url text,
  product_url text,
  notes text,
  region text DEFAULT 'UK',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id uuid REFERENCES drops(id) ON DELETE SET NULL,
  name text NOT NULL,
  brand text NOT NULL,
  category text,
  colourway text,
  size text,
  status text NOT NULL DEFAULT 'want' CHECK (status IN (
    'want','got_it','missed_it','passed','watching'
  )),
  retail_price numeric,
  resale_price numeric,
  currency text DEFAULT 'GBP',
  image_url text,
  product_url text,
  stockx_url text,
  grailed_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE raffle_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id uuid REFERENCES drops(id) ON DELETE SET NULL,
  wishlist_item_id uuid REFERENCES wishlist_items(id) ON DELETE SET NULL,
  retailer text NOT NULL,
  item_name text NOT NULL,
  brand text NOT NULL,
  size text,
  entry_date timestamptz DEFAULT now(),
  deadline timestamptz,
  result text CHECK (result IN ('pending','won','lost','not_entered')),
  result_date timestamptz,
  retail_price numeric,
  payment_url text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cook_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer text NOT NULL UNIQUE,
  retailer_url text,
  region text DEFAULT 'UK',
  difficulty text CHECK (difficulty IN ('easy','medium','hard','bot_only')),
  account_age_required text,
  payment_tips text,
  size_selection_tips text,
  checkout_tips text,
  raffle_tips text,
  vpn_recommended boolean DEFAULT false,
  bot_compatible boolean DEFAULT false,
  success_rate text,
  last_updated date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE drop_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  check_interval_minutes integer DEFAULT 5,
  enabled boolean DEFAULT true,
  last_checked_at timestamptz,
  last_status text,
  in_stock boolean DEFAULT false,
  notify_telegram boolean DEFAULT true,
  keywords text[],
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_drops_date ON drops (drop_date);
CREATE INDEX idx_drops_status ON drops (status);
CREATE INDEX idx_wishlist_status ON wishlist_items (status);
CREATE INDEX idx_raffle_result ON raffle_entries (result);
CREATE INDEX idx_monitors_enabled ON drop_monitors (enabled) WHERE enabled = true;

-- Seed cook guides for key UK retailers (content to be added manually)
INSERT INTO cook_guides (retailer, retailer_url) VALUES
  ('Palace', 'https://www.palaceskateboards.com'),
  ('Supreme', 'https://www.supremenewyork.com'),
  ('SNKRS (Nike)', 'https://www.nike.com/gb/launch'),
  ('Hanon', 'https://www.hanon-shop.com'),
  ('size?', 'https://www.size.co.uk'),
  ('END Clothing', 'https://www.endclothing.com'),
  ('Footpatrol', 'https://www.footpatrol.com'),
  ('Offspring', 'https://www.offspring.co.uk'),
  ('BSTN', 'https://www.bstn.com'),
  ('Solebox', 'https://www.solebox.com');
