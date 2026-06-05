create table exercise_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  canonical_name text not null,
  alias text not null,
  created_at timestamptz not null default now()
);

create unique index idx_exercise_aliases_unique on exercise_aliases (user_id, lower(alias));
create index idx_exercise_aliases_canonical on exercise_aliases (user_id, lower(canonical_name));

alter table exercise_aliases enable row level security;

create policy "exercise_aliases_user" on exercise_aliases
  for all using (user_id = current_setting('app.user_id', true))
  with check (user_id = current_setting('app.user_id', true));
