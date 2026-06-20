CREATE TABLE eye_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescribed_at date NOT NULL,
  optician text,
  eye text NOT NULL CHECK (eye IN ('left','right')),
  sphere numeric,
  cylinder numeric,
  axis smallint CHECK (axis BETWEEN 0 AND 180),
  add_power numeric,
  pupillary_distance numeric,
  is_contact_lens boolean DEFAULT false,
  base_curve numeric,
  diameter numeric,
  brand text,
  notes text,
  created_at timestamptz DEFAULT now()
);
