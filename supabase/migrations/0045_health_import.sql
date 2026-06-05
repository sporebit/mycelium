-- Apple Health ingest: metrics and workout imports with idempotent upserts.

create table health_metrics (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  metric_type   text not null,          -- steps, heart_rate, resting_hr, hrv, sleep, weight, blood_oxygen, etc.
  value         double precision not null,
  unit          text not null,          -- count, bpm, ms, kg, hours, percent
  date          date not null,          -- Europe/London local date
  source        text,                   -- e.g. "apple_watch", "iphone", "manual"
  recorded_at   timestamptz,            -- original timestamp from Apple Health
  created_at    timestamptz not null default now(),
  constraint uq_health_metrics unique (user_id, metric_type, date, source)
);

create index idx_health_metrics_user   on health_metrics (user_id, date desc);
create index idx_health_metrics_type   on health_metrics (user_id, metric_type, date desc);

create table health_workouts (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  workout_type    text not null,        -- running, walking, cycling, strength, hiit, etc.
  start_at        timestamptz not null,
  end_at          timestamptz,
  duration_min    double precision,
  distance_km     double precision,
  energy_kcal     double precision,
  avg_hr          double precision,
  max_hr          double precision,
  source          text,
  date            date not null,        -- Europe/London local date of start_at
  created_at      timestamptz not null default now(),
  constraint uq_health_workouts unique (user_id, workout_type, start_at)
);

create index idx_health_workouts_user on health_workouts (user_id, date desc);

alter table health_metrics   enable row level security;
alter table health_workouts  enable row level security;

create policy "health_metrics_user" on health_metrics
  for all using (user_id = current_setting('app.user_id', true))
  with check  (user_id = current_setting('app.user_id', true));

create policy "health_workouts_user" on health_workouts
  for all using (user_id = current_setting('app.user_id', true))
  with check  (user_id = current_setting('app.user_id', true));
