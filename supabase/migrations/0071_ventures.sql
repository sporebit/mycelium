CREATE TABLE ventures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tagline text,
  parent_id uuid REFERENCES ventures(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'business' CHECK (kind IN (
    'organisation','business','store','project','idea'
  )),
  status text NOT NULL DEFAULT 'idea' CHECK (status IN (
    'idea','exploring','building','launched','paused','closed'
  )),
  description text,
  problem text,
  target_market text,
  mvp text,
  revenue_model text,
  pricing_notes text,
  cost_estimate_monthly numeric,
  cost_estimate_setup numeric,
  revenue_projection_monthly numeric,
  brand_notes text,
  competitors text,
  website_url text,
  accent_colour text DEFAULT '#84f5b8',
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE venture_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  linked_task_id uuid,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE venture_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN (
    'meta','tiktok','google','pinterest','twitter','youtube','other'
  )),
  campaign_name text,
  headline text,
  body_copy text,
  media_url text,
  media_type text CHECK (media_type IN ('image','video','carousel')),
  start_date date,
  end_date date,
  budget_spent numeric,
  impressions integer,
  clicks integer,
  conversions integer,
  roas numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE venture_inspiration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  website_url text,
  category text CHECK (category IN (
    'business_model','customer_service','product','branding',
    'marketing','workflow','pricing','other'
  )),
  what_i_like text NOT NULL,
  image_url text,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
