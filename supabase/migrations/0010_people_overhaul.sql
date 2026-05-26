-- ---------------------------------------------------------------------------
-- Phase 3: People overhaul.
--   Replaces the simple `entities` model with a proper Rolodex + alias system
--   + mention tracking. The `entities` table is left in place — tasks still
--   point at entities for now. A separate future round will consolidate.
-- ---------------------------------------------------------------------------

create table if not exists people (
  id              uuid        primary key default gen_random_uuid(),
  user_id         text        not null,
  first_name      text        not null,
  last_name       text,
  display_name    text,
  relationship    text,
  phone           text,
  email           text,
  birthday        date,
  address         text,
  where_we_met    text,
  mutual_interests text,
  notes           text,
  needs_review    boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table people enable row level security;
create policy "deny all" on people as restrictive using (false);
create index if not exists people_user_idx on people(user_id);
create index if not exists people_needs_review_idx
  on people(user_id, needs_review) where needs_review = true;

create table if not exists people_aliases (
  id          uuid        primary key default gen_random_uuid(),
  person_id   uuid        not null references people(id) on delete cascade,
  alias       text        not null,
  is_primary  boolean     not null default false,
  created_at  timestamptz not null default now(),
  unique (person_id, alias)
);
alter table people_aliases enable row level security;
create policy "deny all" on people_aliases as restrictive using (false);
create index if not exists people_aliases_alias_idx on people_aliases(alias);
create index if not exists people_aliases_person_idx on people_aliases(person_id);

create table if not exists people_mentions (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               text        not null,
  person_id             uuid        references people(id) on delete cascade,
  source_type           text        not null check (source_type in ('capture','task','journal')),
  source_id             uuid        not null,
  raw_alias             text        not null,
  confidence            text        not null check (confidence in ('high','medium','low','ambiguous','unresolved')),
  candidate_person_ids  uuid[],
  needs_review          boolean     not null default false,
  resolved_at           timestamptz,
  created_at            timestamptz not null default now()
);
alter table people_mentions enable row level security;
create policy "deny all" on people_mentions as restrictive using (false);
create index if not exists mentions_source_idx on people_mentions(source_type, source_id);
create index if not exists mentions_person_idx on people_mentions(person_id);
create index if not exists mentions_review_idx
  on people_mentions(user_id, needs_review) where needs_review = true;

grant all on people, people_aliases, people_mentions to service_role;
