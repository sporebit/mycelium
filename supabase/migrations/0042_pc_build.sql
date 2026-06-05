-- PC build log: track current components and upgrade history.

create table pc_components (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  category        text not null,        -- CPU, GPU, RAM, Storage, Motherboard, PSU, Case, Cooling, Display, Peripheral, Other
  name            text not null,        -- e.g. "RTX 4080 Super"
  brand           text,                 -- e.g. "NVIDIA", "Corsair"
  specs           text,                 -- freeform specs: "16GB DDR5 6000MHz", "2TB NVMe Gen4"
  purchase_date   date,
  price_paid      numeric(10,2),
  currency        text not null default 'GBP',
  date_removed    date,                 -- null = currently installed
  removal_reason  text,                 -- e.g. "upgraded", "failed", "sold"
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_pc_components_user    on pc_components (user_id);
create index idx_pc_components_current on pc_components (user_id) where date_removed is null;

alter table pc_components enable row level security;

create policy "pc_components_user" on pc_components
  for all using (user_id = current_setting('app.user_id', true))
  with check  (user_id = current_setting('app.user_id', true));
