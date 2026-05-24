-- ---------------------------------------------------------------------------
-- Fitness foundation: programmes, phases, sessions, exercises, logged data,
-- body composition tracking.
-- ---------------------------------------------------------------------------

-- 1. Programmes: named training plans
create table if not exists workout_programmes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  name        text        not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table workout_programmes enable row level security;
create policy "deny all" on workout_programmes as restrictive using (false);

-- 2. Phases: schedule which programme runs which weeks
create table if not exists workout_programme_phases (
  id              uuid        primary key default gen_random_uuid(),
  user_id         text        not null,
  programme_id    uuid        not null references workout_programmes(id) on delete cascade,
  start_week_iso  text        not null,
  end_week_iso    text,
  created_at      timestamptz not null default now()
);
alter table workout_programme_phases enable row level security;
create policy "deny all" on workout_programme_phases as restrictive using (false);
create index if not exists workout_phases_user_idx
  on workout_programme_phases(user_id, start_week_iso);

-- 3. Template session: a slot in the weekly programme
create table if not exists workout_programme_sessions (
  id            uuid    primary key default gen_random_uuid(),
  programme_id  uuid    not null references workout_programmes(id) on delete cascade,
  day_of_week   int     not null check (day_of_week between 0 and 6),
  slot          text    not null check (slot in ('morning','afternoon')),
  kind          text    not null check (kind in ('cardio','resistance')),
  name          text    not null,
  notes         text,
  unique (programme_id, day_of_week, slot)
);
alter table workout_programme_sessions enable row level security;
create policy "deny all" on workout_programme_sessions as restrictive using (false);

-- 4. Template exercises: pre-defined list of exercises per session
create table if not exists workout_programme_exercises (
  id                    uuid    primary key default gen_random_uuid(),
  programme_session_id  uuid    not null references workout_programme_sessions(id) on delete cascade,
  position              int     not null,
  name                  text    not null,
  notes                 text,
  default_sets          int,
  default_reps          text,
  default_weight        numeric,
  default_weight_unit   text    check (default_weight_unit in ('kg','lbs','stone')),
  rest_seconds          int     default 90,
  default_duration_min  int,
  default_distance_km   numeric,
  default_intensity     text
);
alter table workout_programme_exercises enable row level security;
create policy "deny all" on workout_programme_exercises as restrictive using (false);
create index if not exists workout_template_ex_idx
  on workout_programme_exercises(programme_session_id, position);

-- 5. Actual logged sessions
create table if not exists workout_sessions (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               text        not null,
  date                  date        not null,
  slot                  text        not null check (slot in ('morning','afternoon','extra')),
  kind                  text        not null check (kind in ('cardio','resistance','other')),
  name                  text,
  programme_session_id  uuid        references workout_programme_sessions(id) on delete set null,
  calories              int,
  notes                 text,
  free_form_text        text,
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table workout_sessions enable row level security;
create policy "deny all" on workout_sessions as restrictive using (false);
create index if not exists workout_sessions_user_date_idx
  on workout_sessions(user_id, date desc);

-- 6. Logged exercises in a session
create table if not exists workout_session_exercises (
  id                      uuid        primary key default gen_random_uuid(),
  session_id              uuid        not null references workout_sessions(id) on delete cascade,
  position                int         not null,
  name                    text        not null,
  notes                   text,
  comment                 text,
  rest_seconds            int         default 90,
  duration_min            int,
  distance_km             numeric,
  intensity               text,
  programme_exercise_id   uuid        references workout_programme_exercises(id) on delete set null,
  save_to_template        boolean     default false,
  added_at                timestamptz not null default now()
);
alter table workout_session_exercises enable row level security;
create policy "deny all" on workout_session_exercises as restrictive using (false);

-- 7. Logged sets (resistance)
create table if not exists workout_sets (
  id                    uuid        primary key default gen_random_uuid(),
  session_exercise_id   uuid        not null references workout_session_exercises(id) on delete cascade,
  set_number            int         not null,
  reps                  int,
  weight                numeric,
  unit                  text        check (unit in ('kg','lbs','stone')),
  completed_at          timestamptz,
  unique (session_exercise_id, set_number)
);
alter table workout_sets enable row level security;
create policy "deny all" on workout_sets as restrictive using (false);

-- 8. Body composition tracking
create table if not exists body_metrics (
  id              uuid        primary key default gen_random_uuid(),
  user_id         text        not null,
  date            date        not null,
  weight          numeric,
  weight_unit     text        default 'kg' check (weight_unit in ('kg','lbs','stone')),
  body_fat_pct    numeric,
  muscle_mass_kg  numeric,
  waist_cm        numeric,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (user_id, date)
);
alter table body_metrics enable row level security;
create policy "deny all" on body_metrics as restrictive using (false);
create index if not exists body_metrics_user_date_idx
  on body_metrics(user_id, date desc);

grant all on workout_programmes,
              workout_programme_phases,
              workout_programme_sessions,
              workout_programme_exercises,
              workout_sessions,
              workout_session_exercises,
              workout_sets,
              body_metrics
  to service_role;
