-- journal_entries and journal_daily_summaries.
--
-- HISTORY: this file originally held two diagnostic SELECTs and no DDL. The
-- tables were created on the hosted project outside the migration chain, so
-- the chain could not be replayed from empty (found 2026-09-08 during the
-- multi-user Part 0 local replay: "relation journal_entries does not exist"
-- at statement 0 of this file). The DDL below is the base shape reconstructed
-- from a `supabase db dump --linked --schema public` of the live database,
-- minus the columns, constraint and index that later migrations add:
--   0029  deleted_at, converted_from, journal_active_idx
--   0030  context_where / context_device / context_energy / context_tag and
--         journal_entries_context_energy_chk
-- Both later migrations use IF NOT EXISTS guards, so they replay cleanly on
-- top of this. The hosted project already records 0003 as applied, so this
-- rewrite is never executed there.

-- ---------------------------------------------------------------------------
-- journal_entries
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

create index if not exists journal_entries_user_date_idx
  on journal_entries (user_id, entry_date desc);
create index if not exists journal_entries_tags_idx
  on journal_entries using gin (tags);

alter table journal_entries enable row level security;
create policy "deny all" on journal_entries as restrictive using (false);

-- ---------------------------------------------------------------------------
-- journal_daily_summaries
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
