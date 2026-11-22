-- 0184 — the Family calendar is a Google calendar (claude/family-calendar-spec.md).
--
-- The in-app Family calendar (family_entries, kind = 'appointment', 0171)
-- and a second calendar called "Family" in Phil's own Google account become
-- the same calendar, in both directions. Kirsty has that one calendar
-- shared to her Gmail; nothing else of Phil's is shared or read.
--
--   family_entries            gains the columns an outside copy needs: which
--                             provider and event it mirrors, Google's etag
--                             and iCal UID (so a disconnect and reconnect
--                             finds the same row again, never a duplicate),
--                             an end, all-day, the recurring series it is an
--                             instance of, and when the other side last
--                             changed it. `source` admits 'google' (it came
--                             in from the calendar) and 'phirstmaxx' (a plan
--                             the PhirstMaxx section accepted).
--   family_calendar_sync      one row per family space: which calendar, whose
--                             Google connection does the talking, the sync
--                             token, the push channel, when it last synced,
--                             the last error, and the daily health check.
--   family_calendar_sync_log  what the sync did and, above all, every time
--                             Google's copy overwrote a change made here.
--   user_settings             gains google_account_email: which Google
--                             account is connected, shown in Settings and
--                             checked against GOOGLE_ALLOWED_ACCOUNTS at
--                             connect time (spec §4.5).
--
-- Both new tables take the family entity group (organisation.family): a
-- member of the family team reads them, nobody outside does. The sync
-- token and the push channel's token are not secrets that unlock anything
-- on their own (the OAuth tokens stay on user_settings, the owner's alone),
-- so they live with the rest of the family's data rather than behind the
-- service role; that also keeps the account export (0182) reading them.
--
-- Depends on: 0171 (family_entries, family_profile), 0141 (app.register_table),
-- 0088/0150 (user_settings Google columns).

-- ---------------------------------------------------------------------
-- 1. family_entries: the outside copy
-- ---------------------------------------------------------------------
alter table public.family_entries
	add column if not exists ext_provider       text check (ext_provider is null or ext_provider in ('google')),
	add column if not exists ext_id             text,
	add column if not exists ext_etag           text,
	add column if not exists ext_ical_uid       text,
	add column if not exists ext_updated_at     timestamptz,
	add column if not exists ends_at            timestamptz,
	add column if not exists all_day            boolean not null default false,
	add column if not exists recurring_event_id text;

alter table public.family_entries drop constraint if exists family_entries_source_check;
alter table public.family_entries
	add constraint family_entries_source_check check (source in ('app', 'capture', 'upload', 'google', 'phirstmaxx'));

alter table public.family_entries drop constraint if exists family_entries_ends_after_start;
alter table public.family_entries
	add constraint family_entries_ends_after_start check (ends_at is null or starts_at is null or ends_at >= starts_at);

-- one row per Google event per space: a reconnect finds the row it already has
create unique index if not exists family_entries_ext_once
	on public.family_entries (space_id, ext_provider, ext_id)
	where ext_id is not null;

-- ---------------------------------------------------------------------
-- 2. The connection, per family space
-- ---------------------------------------------------------------------
create table if not exists public.family_calendar_sync (
	id                  uuid primary key default gen_random_uuid(),
	-- the Google calendar id ("…@group.calendar.google.com")
	calendar_id         text,
	calendar_summary    text,
	-- whose Google connection (user_settings tokens) the sync speaks through
	owner_user_id       uuid references auth.users (id) on delete set null,
	-- Google's incremental sync token for events.list; null = a full sync is due
	sync_token          text,
	last_synced_at      timestamptz,
	last_sync_error     text,
	last_sync_error_at  timestamptz,
	-- the push channel (events.watch); renewed by the cron before it expires
	channel_id          text,
	channel_resource_id text,
	channel_token       text,
	channel_expires_at  timestamptz,
	channel_error       text,
	-- Mycelium's own appointment reminders stay; Google's are off unless asked
	google_reminders    boolean not null default false,
	-- the daily check: refresh the token, read one page
	health_checked_at   timestamptz,
	health_ok           boolean,
	health_error        text,
	-- when "Reconnect needed" was last pushed to the owner (once a day at most)
	health_nudged_on    date,
	created_at          timestamptz not null default now(),
	updated_at          timestamptz not null default now()
);
select app.register_table('family_calendar_sync', 'organisation', 'family');
create unique index if not exists family_calendar_sync_one_per_space on public.family_calendar_sync (space_id);
create unique index if not exists family_calendar_sync_channel on public.family_calendar_sync (channel_id) where channel_id is not null;

create table if not exists public.family_calendar_sync_log (
	id         uuid primary key default gen_random_uuid(),
	entry_id   uuid,
	ext_id     text,
	-- 'in' Google → Mycelium; 'out' Mycelium → Google
	direction  text not null check (direction in ('in', 'out')),
	action     text not null check (action in ('created', 'updated', 'deleted', 'overwritten', 'queued', 'retried', 'failed', 'full_sync', 'health')),
	detail     jsonb not null default '{}'::jsonb,
	at         timestamptz not null default now()
);
select app.register_table('family_calendar_sync_log', 'organisation', 'family');
create index if not exists family_calendar_sync_log_recent on public.family_calendar_sync_log (space_id, at desc);

-- ---------------------------------------------------------------------
-- 3. Which Google account is connected
-- ---------------------------------------------------------------------
alter table public.user_settings add column if not exists google_account_email text;
comment on column public.user_settings.google_account_email is
	'The Google account the calendar connection belongs to (the primary calendar''s id). Checked against GOOGLE_ALLOWED_ACCOUNTS at connect time; shown beside "Connected" in Settings.';

-- ---------------------------------------------------------------------
-- 4. Self-check
-- ---------------------------------------------------------------------
do $$
declare
	t text;
begin
	foreach t in array array['family_calendar_sync', 'family_calendar_sync_log']
	loop
		if not exists (select 1 from public.entity_groups where table_name = t and section = 'organisation' and entity_group = 'family') then
			raise exception 'family calendar self-check: % is not registered', t;
		end if;
		if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
			raise exception 'family calendar self-check: % has no row security', t;
		end if;
	end loop;
	if not exists (select 1 from pg_constraint where conname = 'family_entries_source_check' and pg_get_constraintdef(oid) like '%google%') then
		raise exception 'family calendar self-check: family_entries.source does not admit google';
	end if;
end
$$;
