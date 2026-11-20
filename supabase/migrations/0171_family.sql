-- 0171 — the family space (master run §8, Stream D).
--
-- Everything a household shares, on one timeline, in a TEAM's space. There
-- is no new kind of space: the family space is the team space that holds a
-- family_profile row. Team membership, roles and the session gate apply as
-- they do to everything else in a team's space.
--
-- All ten tables are one entity group, organisation.family. Not a new
-- section: sections are fixed by two check constraints (0110) and nothing
-- here needs its own toggle.
--
--   family_profile        one per space: the due date, the birth, the name
--   family_acks           who has confirmed that what they add here is shared
--   family_entries        THE timeline: notes, scans, appointments,
--                         milestones, photos, letters to the baby
--   family_names          name ideas
--   family_name_votes     one vote per person per name
--   family_lists          prep checklists (nursery, hospital bag, buying list)
--   family_list_items     price, bought, link per item
--   baby_log              feeds, sleep, nappies
--   household_items       documents, warranties, bins
--   household_costs       the household budget: bills, baby costs, who paid
--                         what. Family data. Nothing to do with the finance
--                         section, which stays owner-only and never shared.
--
-- Files (scans, photos, a letter's recording) live in a private bucket,
-- "family", under <space id>/…; the storage rules read the space from the
-- path. Photos move to Cloudflare R2 when that account exists (Phil's);
-- the column holds a path either way.
--
-- Keepsakes later (film, time-capsule site, letters collection, photobook)
-- read family_entries: every entry has a stable id, a date, an author, its
-- words and at most one file, and a letter keeps the question it answers.
--
-- Columns that name a person are never called user_id (app.adopt_table
-- replaces that column).
--
-- Depends on: 0141 (app.register_table), 0158 (app.uuid_or_null),
-- 0160 (app.accessible_spaces), 0164 (the storage session gate).

-- ---------------------------------------------------------------------
-- 1. The profile and the acknowledgements
-- ---------------------------------------------------------------------
create table if not exists public.family_profile (
	id         uuid primary key default gen_random_uuid(),
	due_on     date,
	born_on    date,
	baby_name  text check (baby_name is null or length(btrim(baby_name)) between 1 and 80),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
select app.register_table('family_profile', 'organisation', 'family');
create unique index if not exists family_profile_one_per_space on public.family_profile (space_id);

create table if not exists public.family_acks (
	id        uuid primary key default gen_random_uuid(),
	member_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	acked_at  timestamptz not null default now()
);
select app.register_table('family_acks', 'organisation', 'family');
create unique index if not exists family_acks_once on public.family_acks (space_id, member_id);
-- nobody confirms on someone else's behalf
drop policy if exists family_acks_own on public.family_acks;
create policy family_acks_own on public.family_acks
	as restrictive for insert to authenticated
	with check (member_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. The timeline
-- ---------------------------------------------------------------------
create table if not exists public.family_entries (
	id          uuid primary key default gen_random_uuid(),
	kind        text not null check (kind in ('note', 'scan', 'appointment', 'milestone', 'photo', 'letter')),
	title       text not null check (length(btrim(title)) between 1 and 200),
	body        text,
	happened_on date not null default ((now() at time zone 'Europe/London')::date),
	-- an appointment's time; its happened_on is that day in London
	starts_at   timestamptz,
	place       text,
	media_path  text,
	media_mime  text,
	-- a letter keeps the question it answers
	prompt      text,
	-- a letter spoken aloud waits here for its words
	transcribed boolean not null default true,
	source      text not null default 'app' check (source in ('app', 'capture', 'upload')),
	capture_id  uuid,
	-- which reminders have gone out for an appointment: {"day_before": "...", "two_hours": "..."}
	reminded    jsonb not null default '{}'::jsonb,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now(),
	constraint family_entries_appointment_has_time check (kind <> 'appointment' or starts_at is not null)
);
select app.register_table('family_entries', 'organisation', 'family');
create index if not exists family_entries_timeline on public.family_entries (space_id, happened_on desc, created_at desc);
create index if not exists family_entries_upcoming on public.family_entries (starts_at) where kind = 'appointment';

-- ---------------------------------------------------------------------
-- 3. Names
-- ---------------------------------------------------------------------
create table if not exists public.family_names (
	id         uuid primary key default gen_random_uuid(),
	name       text not null check (length(btrim(name)) between 1 and 60),
	note       text,
	created_at timestamptz not null default now()
);
select app.register_table('family_names', 'organisation', 'family');
create unique index if not exists family_names_once on public.family_names (space_id, lower(btrim(name)));

create table if not exists public.family_name_votes (
	id       uuid primary key default gen_random_uuid(),
	name_id  uuid not null references public.family_names (id) on delete cascade,
	voter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	-- 2 love, 1 like, -1 not this one
	vote     smallint not null check (vote in (-1, 1, 2)),
	voted_at timestamptz not null default now()
);
select app.register_table('family_name_votes', 'organisation', 'family', 'family_names', 'name_id');
create unique index if not exists family_name_votes_once on public.family_name_votes (name_id, voter_id);
-- a vote is its voter's: nobody casts, changes or removes another person's
drop policy if exists family_name_votes_own_write on public.family_name_votes;
drop policy if exists family_name_votes_own_change on public.family_name_votes;
drop policy if exists family_name_votes_own_delete on public.family_name_votes;
create policy family_name_votes_own_write on public.family_name_votes
	as restrictive for insert to authenticated with check (voter_id = auth.uid());
create policy family_name_votes_own_change on public.family_name_votes
	as restrictive for update to authenticated using (voter_id = auth.uid()) with check (voter_id = auth.uid());
create policy family_name_votes_own_delete on public.family_name_votes
	as restrictive for delete to authenticated using (voter_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. Prep checklists
-- ---------------------------------------------------------------------
create table if not exists public.family_lists (
	id         uuid primary key default gen_random_uuid(),
	slug       text not null check (slug ~ '^[a-z][a-z0-9-]{0,39}$'),
	title      text not null check (length(btrim(title)) between 1 and 80),
	sort       integer not null default 0,
	created_at timestamptz not null default now()
);
select app.register_table('family_lists', 'organisation', 'family');
create unique index if not exists family_lists_slug on public.family_lists (space_id, slug);

create table if not exists public.family_list_items (
	id          uuid primary key default gen_random_uuid(),
	list_id     uuid not null references public.family_lists (id) on delete cascade,
	title       text not null check (length(btrim(title)) between 1 and 200),
	price_pence integer check (price_pence is null or price_pence between 0 and 100000000),
	qty         smallint not null default 1 check (qty between 1 and 999),
	bought      boolean not null default false,
	bought_by   uuid references auth.users (id) on delete set null,
	bought_at   timestamptz,
	link        text check (link is null or link ~* '^https?://'),
	note        text,
	sort        integer not null default 0,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);
select app.register_table('family_list_items', 'organisation', 'family', 'family_lists', 'list_id');
create index if not exists family_list_items_by_list on public.family_list_items (list_id, sort, created_at);

-- ---------------------------------------------------------------------
-- 5. The baby log
-- ---------------------------------------------------------------------
create table if not exists public.baby_log (
	id         uuid primary key default gen_random_uuid(),
	kind       text not null check (kind in ('feed', 'sleep', 'nappy')),
	started_at timestamptz not null default now(),
	-- a sleep that is still going has no end
	ended_at   timestamptz,
	-- feed: {"how": "left" | "right" | "both" | "bottle", "ml": 90}; nappy: {"what": "wet" | "dirty" | "both"}
	detail     jsonb not null default '{}'::jsonb,
	note       text,
	created_at timestamptz not null default now(),
	constraint baby_log_ends_after_start check (ended_at is null or ended_at >= started_at)
);
select app.register_table('baby_log', 'organisation', 'family');
create index if not exists baby_log_recent on public.baby_log (space_id, started_at desc);

-- ---------------------------------------------------------------------
-- 6. Household
-- ---------------------------------------------------------------------
create table if not exists public.household_items (
	id         uuid primary key default gen_random_uuid(),
	kind       text not null check (kind in ('document', 'warranty', 'bin', 'other')),
	title      text not null check (length(btrim(title)) between 1 and 200),
	note       text,
	-- a warranty or a document that runs out
	expires_on date,
	file_path  text,
	file_mime  text,
	-- a bin: {"weekday": 0-6 (0 = Sunday), "every_weeks": 1 | 2, "anchor_on": "YYYY-MM-DD"}
	schedule   jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
select app.register_table('household_items', 'organisation', 'family');
create index if not exists household_items_by_kind on public.household_items (space_id, kind, title);

create table if not exists public.household_costs (
	id           uuid primary key default gen_random_uuid(),
	title        text not null check (length(btrim(title)) between 1 and 200),
	amount_pence integer not null check (amount_pence between 0 and 100000000),
	paid_by      uuid references auth.users (id) on delete set null,
	paid_on      date not null default ((now() at time zone 'Europe/London')::date),
	category     text not null default 'other' check (category in ('bill', 'baby', 'house', 'food', 'other')),
	recurs       text not null default 'none' check (recurs in ('none', 'monthly', 'yearly')),
	note         text,
	created_at   timestamptz not null default now(),
	updated_at   timestamptz not null default now()
);
select app.register_table('household_costs', 'organisation', 'family');
create index if not exists household_costs_by_month on public.household_costs (space_id, paid_on desc);

-- ---------------------------------------------------------------------
-- 7. Files
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('family', 'family', false)
on conflict (id) do nothing;

drop policy if exists "family files read"   on storage.objects;
drop policy if exists "family files write"  on storage.objects;
drop policy if exists "family files delete" on storage.objects;
create policy "family files read" on storage.objects for select to authenticated
using (
	bucket_id = 'family'
	and app.uuid_or_null((storage.foldername(name))[1]) in (select app.accessible_spaces('organisation.family', 'view'))
);
create policy "family files write" on storage.objects for insert to authenticated
with check (
	bucket_id = 'family'
	and app.uuid_or_null((storage.foldername(name))[1]) in (select app.accessible_spaces('organisation.family', 'create_delete'))
);
create policy "family files delete" on storage.objects for delete to authenticated
using (
	bucket_id = 'family'
	and app.uuid_or_null((storage.foldername(name))[1]) in (select app.accessible_spaces('organisation.family', 'create_delete'))
);

-- ---------------------------------------------------------------------
-- 8. Self-check: every table is behind the wall
-- ---------------------------------------------------------------------
do $$
declare
	t text;
begin
	foreach t in array array['family_profile', 'family_acks', 'family_entries', 'family_names', 'family_name_votes',
		'family_lists', 'family_list_items', 'baby_log', 'household_items', 'household_costs']
	loop
		if not exists (select 1 from public.entity_groups where table_name = t and section = 'organisation' and entity_group = 'family') then
			raise exception 'family self-check: % is not registered', t;
		end if;
		if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
			raise exception 'family self-check: % has no row security', t;
		end if;
	end loop;
end
$$;
