-- Service accounts register (subscriptions, SaaS, etc.)
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  url text,
  category text NOT NULL DEFAULT 'Other',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'paused', 'trial')),
  cost_amount numeric,
  cost_currency text DEFAULT 'GBP',
  cost_period text CHECK (cost_period IN ('monthly', 'annual', 'one_off')),
  renewal_date date,
  payment_method text,
  opened_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
