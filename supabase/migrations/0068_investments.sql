CREATE TABLE investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ticker text,
  category text NOT NULL CHECK (category IN (
    'stock', 'etf', 'crypto', 'commodity', 'collectible',
    'sneakers', 'cards', 'other'
  )),
  sub_category text,
  quantity numeric NOT NULL,
  buy_price numeric NOT NULL,
  buy_currency text DEFAULT 'GBP',
  buy_date date,
  current_price numeric,
  current_price_updated_at timestamptz,
  platform text,
  notes text,
  image_url text,
  sold boolean DEFAULT false,
  sell_price numeric,
  sell_date date,
  created_at timestamptz DEFAULT now()
);
