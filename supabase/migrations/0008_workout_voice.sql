-- ---------------------------------------------------------------------------
-- Fitness Round 3c: voice capture support.
--   pending_workout_routes — temporary holding table for voice captures that
--   the parser couldn't unambiguously route. Resolved via Telegram inline
--   keyboard or the resolve API. Rows TTL after one hour.
-- ---------------------------------------------------------------------------

create table if not exists pending_workout_routes (
  id              uuid        primary key default gen_random_uuid(),
  user_id         text        not null,
  raw_text        text        not null,
  parsed_payload  jsonb       not null,
  -- Snapshot of the candidate buttons the keyboard was built with.
  -- Shape: [{ session_id, state, name, slot, kind }]. Indexed by position.
  button_options  jsonb       not null default '[]'::jsonb,
  expires_at      timestamptz not null default (now() + interval '1 hour'),
  created_at      timestamptz not null default now()
);
alter table pending_workout_routes enable row level security;
create policy "deny all" on pending_workout_routes as restrictive using (false);

create index if not exists pending_routes_user_idx
  on pending_workout_routes(user_id, expires_at);

grant all on pending_workout_routes to service_role;
