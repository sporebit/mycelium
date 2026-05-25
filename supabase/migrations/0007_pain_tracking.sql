-- ---------------------------------------------------------------------------
-- Fitness Round 3b: pain tracking foundation.
--   - exercise_baselines: static reference data per exercise — known issues,
--     typical severity range, regions, conditional notes. Seeded from the
--     user's injury_tracker spreadsheet, evolves over time.
--   - exercise_pain_logs: per-session pain entry, attached to a specific
--     workout_session_exercises row.
-- ---------------------------------------------------------------------------

create table if not exists exercise_baselines (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                text        not null,
  exercise_name          text        not null,
  has_known_issues       boolean     default false,
  typical_severity_min   int,
  typical_severity_max   int,
  pain_regions           text[],
  conditional_notes      text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, exercise_name)
);
alter table exercise_baselines enable row level security;
create policy "deny all" on exercise_baselines as restrictive using (false);
create index if not exists exercise_baselines_user_idx
  on exercise_baselines(user_id);

create table if not exists exercise_pain_logs (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               text        not null,
  session_exercise_id   uuid        not null references workout_session_exercises(id) on delete cascade,
  severity              int         check (severity between 0 and 10),
  feel_rating           text        check (feel_rating in ('great','good','ok','mild','moderate','painful','stopped')),
  pain_regions          text[],
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table exercise_pain_logs enable row level security;
create policy "deny all" on exercise_pain_logs as restrictive using (false);
create index if not exists exercise_pain_logs_session_ex_idx
  on exercise_pain_logs(session_exercise_id);

grant all on exercise_baselines, exercise_pain_logs to service_role;
