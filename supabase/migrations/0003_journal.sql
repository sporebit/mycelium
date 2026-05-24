-- ---------------------------------------------------------------------------
-- journal_entries
-- A separate channel from raw_captures for reflection / observation /
-- longer-form thinking. Linked back to raw_captures via raw_capture_id so
-- the source row stays as the canonical audit record.
-- ---------------------------------------------------------------------------
create table if not exists journal_entries (
  id              uuid        primary key default gen_random_uuid(),
  user_id         text        not null,
  entry_date      date        not null,
  raw_text        text        not null,
  audio_url       text,
  summary         text,
  tags            text[],
  mood            text,
  raw_capture_id  uuid        references raw_captures(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table journal_entries enable row level security;
create policy "deny all" on journal_entries as restrictive using (false);

create index if not exists journal_entries_user_date_idx
  on journal_entries (user_id, entry_date desc);

create index if not exists journal_entries_tags_idx
  on journal_entries using gin (tags);

grant all on journal_entries to service_role;

-- ---------------------------------------------------------------------------
-- journal_daily_summaries
-- One row per user per day. Generated on demand by the summary endpoint.
-- ---------------------------------------------------------------------------
create table if not exists journal_daily_summaries (
  user_id       text        not null,
  entry_date    date        not null,
  summary       text        not null,
  entry_ids     uuid[]      not null,
  generated_at  timestamptz not null default now(),
  primary key (user_id, entry_date)
);

alter table journal_daily_summaries enable row level security;
create policy "deny all" on journal_daily_summaries as restrictive using (false);

grant all on journal_daily_summaries to service_role;
