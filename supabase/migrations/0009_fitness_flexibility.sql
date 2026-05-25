-- ---------------------------------------------------------------------------
-- Fitness Round 4: flexibility.
--   - session_type on workout_sessions
--   - swapped_from_programme_session_id audit field
--   - workout_session_types catalog (built-ins + user-defined)
--   - typical_logging_mode on type rows ('full' = grid; 'simple' = name+notes)
-- ---------------------------------------------------------------------------

alter table workout_sessions
  add column if not exists session_type text;

alter table workout_sessions
  add column if not exists swapped_from_programme_session_id uuid
    references workout_programme_sessions(id) on delete set null;

create table if not exists workout_session_types (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                text        not null,
  type_key               text        not null,
  label                  text        not null,
  is_builtin             boolean     not null default false,
  typical_logging_mode   text        not null default 'full'
    check (typical_logging_mode in ('full', 'simple')),
  created_at             timestamptz not null default now(),
  unique (user_id, type_key)
);
alter table workout_session_types enable row level security;
create policy "deny all" on workout_session_types as restrictive using (false);
create index if not exists session_types_user_idx on workout_session_types(user_id);

grant all on workout_session_types to service_role;

-- Seed built-ins for Phil. Idempotent via ON CONFLICT.
insert into workout_session_types (user_id, type_key, label, is_builtin, typical_logging_mode)
values
  ('phil', 'gym_workout',   'Gym workout',  true, 'full'),
  ('phil', 'gym_class',     'Gym class',    true, 'simple'),
  ('phil', 'pt_session',    'PT session',   true, 'simple'),
  ('phil', 'home_workout',  'Home workout', true, 'full'),
  ('phil', 'hiking',        'Hiking',       true, 'simple'),
  ('phil', 'walk',          'Walk',         true, 'simple'),
  ('phil', 'skipping',      'Skipping',     true, 'full')
on conflict (user_id, type_key) do nothing;
