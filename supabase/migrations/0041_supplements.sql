-- Supplement tracker: library of active supplements + timestamped dose logs.

create table supplements (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null,
  brand       text,
  dose        text not null,          -- e.g. "500mg", "1 capsule", "5ml"
  form        text not null default 'capsule', -- capsule, tablet, powder, liquid, gummy, spray
  schedule    text,                   -- e.g. "morning", "morning + evening", "with meals"
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_supplements_user on supplements (user_id);

create table supplement_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  supplement_id   uuid not null references supplements(id) on delete cascade,
  taken_at        timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index idx_supplement_logs_user   on supplement_logs (user_id);
create index idx_supplement_logs_supp   on supplement_logs (supplement_id, taken_at desc);
create index idx_supplement_logs_date   on supplement_logs (user_id, taken_at desc);

alter table supplements      enable row level security;
alter table supplement_logs  enable row level security;

create policy "supplements_user" on supplements
  for all using (user_id = current_setting('app.user_id', true))
  with check  (user_id = current_setting('app.user_id', true));

create policy "supplement_logs_user" on supplement_logs
  for all using (user_id = current_setting('app.user_id', true))
  with check  (user_id = current_setting('app.user_id', true));
