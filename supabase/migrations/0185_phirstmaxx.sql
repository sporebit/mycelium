-- 0185 — PhirstMaxx, a Mycelium section (claude/phirstmaxx-spec.md §3).
--
-- The old PhirstMaxxing app, rewritten inside Mycelium. Two people's busy
-- time painted on a weekly grid, the things they drop in (a link, a photo,
-- a place) researched into cards, and plans the two of them agree to. All
-- of it lives in the family team's space (spec D5): a member of the family
-- team reads and writes it, nobody outside does.
--
--   section 'phirstmaxx'        added to the three section check constraints
--                               (team_member_sections and user_grants, 0110;
--                               entity_groups, 0103)
--   phirstmaxx.time             pm_people, pm_places, pm_block_types, pm_blocks,
--                               pm_waking, pm_patterns, pm_undo, pm_pets
--   phirstmaxx.things           pm_drops, pm_things, pm_thing_facts,
--                               pm_research_runs, pm_travel, pm_api_calls
--   phirstmaxx.plans            pm_plans, pm_plan_responses, pm_plan_legs,
--                               pm_notifications
--
--   pm_save_blocks()            one painted week saved in one transaction
--                               (spec §2.6, §4): overlaps replaced or trimmed,
--                               adjacent slots merged, the originals kept in
--                               pm_undo for ten minutes.
--   pm_undo_blocks()            puts a save back the way it was.
--   pm_seed_space()             the starter block types and a pm_people row
--                               per family member, once.
--   pm_count_api_call()         Google calls counted per product per month,
--                               refused past the cap (spec §11.2: the bill
--                               must not be able to leave £0).
--
-- Every table goes through app.register_table (0141): space_id and
-- created_by adopted, RLS on, the four policies from app.accessible_spaces,
-- service_role granted. Times are timestamptz; blocks are aligned to the
-- half hour by a check. `old_id` columns carry the old app's row ids so the
-- importer (scripts/phirstmaxx-import.mjs) is idempotent.
--
-- Depends on: 0110 (sections), 0141 (register_table), 0159 (jobs),
-- 0171 (the family space), 0184 (family_entries.source 'phirstmaxx').

-- ---------------------------------------------------------------------
-- 1. The section
-- ---------------------------------------------------------------------
do $$
declare
	v_name text;
begin
	-- the unnamed check on team_member_sections.section (0110)
	for v_name in
		select conname from pg_constraint
		where conrelid = 'public.team_member_sections'::regclass
		  and contype = 'c'
		  and pg_get_constraintdef(oid) like '%section%'
	loop
		execute format('alter table public.team_member_sections drop constraint %I', v_name);
	end loop;
	alter table public.team_member_sections
		add constraint team_member_sections_section_check check (section in (
			'organisation', 'fitness', 'health', 'studio', 'drops',
			'ventures', 'journal', 'places', 'reminders', 'media', 'phirstmaxx'));

	-- the third list (0103): where register_table files each table
	alter table public.entity_groups drop constraint if exists entity_groups_section_check;
	alter table public.entity_groups
		add constraint entity_groups_section_check check (section in (
			'organisation', 'fitness', 'health', 'finance', 'studio', 'drops',
			'ventures', 'journal', 'places', 'reminders', 'media', 'platform', 'phirstmaxx'));

	alter table public.user_grants drop constraint if exists user_grants_section_shape;
	alter table public.user_grants
		add constraint user_grants_section_shape check (section in (
			'organisation', 'fitness', 'health', 'studio', 'drops',
			'ventures', 'journal', 'places', 'reminders', 'media', 'phirstmaxx'));

	-- the fourth list (0115): which sections a team's weekly rundown may cover.
	-- The settings card sends every section it knows, so a list without the
	-- new one refuses the owner's save.
	alter table public.rundown_settings drop constraint if exists rundown_settings_sections_shape;
	alter table public.rundown_settings
		add constraint rundown_settings_sections_shape check (sections <@ array[
			'organisation', 'fitness', 'health', 'studio', 'drops',
			'ventures', 'journal', 'places', 'reminders', 'media', 'phirstmaxx']::text[]);
end $$;

-- ---------------------------------------------------------------------
-- 2. phirstmaxx.time
-- ---------------------------------------------------------------------

-- One row per family member in the section: their waking hours, buffers,
-- colour, car, home, and the hash of their inbox token (spec §5 "Anywhere").
create table if not exists public.pm_people (
	id               uuid primary key default gen_random_uuid(),
	person_id        uuid not null references auth.users (id) on delete cascade,
	name             text not null,
	colour           text not null default '#7aa2f7',
	has_car          boolean not null default false,
	waking           jsonb not null default '{"weekday":{"start":"07:00","end":"22:30"},"weekend":{"start":"08:00","end":"23:30"}}'::jsonb,
	buffers          jsonb not null default '{"shift":15,"sit":30,"walk":15}'::jsonb,
	home_place_id    uuid,
	-- sha256 of the inbox token; the token itself is shown once and never stored
	inbox_token_hash text,
	inbox_token_hint text,
	settings         jsonb not null default '{}'::jsonb,
	old_id           text,
	created_at       timestamptz not null default now(),
	updated_at       timestamptz not null default now()
);
select app.register_table('pm_people', 'phirstmaxx', 'time');
create unique index if not exists pm_people_once on public.pm_people (space_id, person_id);
create unique index if not exists pm_people_inbox_token on public.pm_people (inbox_token_hash) where inbox_token_hash is not null;

create table if not exists public.pm_places (
	id         uuid primary key default gen_random_uuid(),
	label      text not null,
	address    text,
	lat        double precision,
	lng        double precision,
	kind       text not null default 'other' check (kind in ('home', 'work', 'other')),
	saved      boolean not null default true,
	-- whose saved start point; null = shared
	person_id  uuid references auth.users (id) on delete set null,
	old_id     text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
select app.register_table('pm_places', 'phirstmaxx', 'time');
create unique index if not exists pm_places_old on public.pm_places (space_id, old_id) where old_id is not null;
alter table public.pm_people drop constraint if exists pm_people_home_fk;
alter table public.pm_people add constraint pm_people_home_fk foreign key (home_place_id) references public.pm_places (id) on delete set null;

create table if not exists public.pm_block_types (
	id               uuid primary key default gen_random_uuid(),
	name             text not null,
	engine_kind      text not null check (engine_kind in ('work', 'shift', 'walk', 'sit', 'busy', 'free', 'faith')),
	colour           text,
	default_firmness text not null default 'firm' check (default_firmness in ('firm', 'flexible')),
	default_place_id uuid references public.pm_places (id) on delete set null,
	is_seed          boolean not null default false,
	sort             int not null default 0,
	old_id           text,
	created_at       timestamptz not null default now(),
	updated_at       timestamptz not null default now()
);
select app.register_table('pm_block_types', 'phirstmaxx', 'time');
create unique index if not exists pm_block_types_name on public.pm_block_types (space_id, lower(name));
create unique index if not exists pm_block_types_old on public.pm_block_types (space_id, old_id) where old_id is not null;

-- A span of someone's time. Half-hour aligned; ends after it starts.
create table if not exists public.pm_blocks (
	id          uuid primary key default gen_random_uuid(),
	person_id   uuid not null references auth.users (id) on delete cascade,
	entered_by  uuid references auth.users (id) on delete set null,
	type_id     uuid not null references public.pm_block_types (id) on delete restrict,
	engine_kind text not null check (engine_kind in ('work', 'shift', 'walk', 'sit', 'busy', 'free', 'faith')),
	starts_at   timestamptz not null,
	ends_at     timestamptz not null,
	firmness    text not null default 'firm' check (firmness in ('firm', 'flexible')),
	place_id    uuid references public.pm_places (id) on delete set null,
	title       text,
	series_id   uuid,
	-- made here (true) or mirrored from the old app (false); the importer never touches local rows (spec §10)
	local       boolean not null default true,
	-- the save that made it, for undo
	undo_batch  uuid,
	old_id      text,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now(),
	constraint pm_blocks_ends_after_start check (ends_at > starts_at),
	constraint pm_blocks_half_hour check (
		(extract(epoch from starts_at)::bigint % 1800) = 0 and (extract(epoch from ends_at)::bigint % 1800) = 0)
);
select app.register_table('pm_blocks', 'phirstmaxx', 'time');
create index if not exists pm_blocks_person_time on public.pm_blocks (space_id, person_id, starts_at);
create index if not exists pm_blocks_series on public.pm_blocks (series_id) where series_id is not null;
create index if not exists pm_blocks_batch on public.pm_blocks (undo_batch) where undo_batch is not null;
create unique index if not exists pm_blocks_old on public.pm_blocks (space_id, old_id) where old_id is not null;

-- "Late one tonight": a later end to one day's waking hours
create table if not exists public.pm_waking (
	id         uuid primary key default gen_random_uuid(),
	person_id  uuid not null references auth.users (id) on delete cascade,
	day        date not null,
	day_end    text not null check (day_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	old_id     text,
	created_at timestamptz not null default now()
);
select app.register_table('pm_waking', 'phirstmaxx', 'time');
create unique index if not exists pm_waking_once on public.pm_waking (space_id, person_id, day);

-- A saved week shape ("my usual week"): slots relative to Monday 00:00 London
create table if not exists public.pm_patterns (
	id         uuid primary key default gen_random_uuid(),
	person_id  uuid not null references auth.users (id) on delete cascade,
	name       text not null,
	-- [{dow 0-6, start_min, end_min, type_id, firmness, place_id, title}]
	blocks     jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
select app.register_table('pm_patterns', 'phirstmaxx', 'time');
create unique index if not exists pm_patterns_name on public.pm_patterns (space_id, person_id, lower(name));

-- What a save removed or shortened, so it can be put back (ten minutes)
create table if not exists public.pm_undo (
	batch_id   uuid primary key,
	person_id  uuid not null,
	-- the rows as they were, in full
	snapshot   jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now()
);
select app.register_table('pm_undo', 'phirstmaxx', 'time');

create table if not exists public.pm_pets (
	id         uuid primary key default gen_random_uuid(),
	name       text not null,
	kind       text not null default 'dog',
	notes      text,
	old_id     text,
	created_at timestamptz not null default now()
);
select app.register_table('pm_pets', 'phirstmaxx', 'time');

-- ---------------------------------------------------------------------
-- 3. phirstmaxx.things
-- ---------------------------------------------------------------------

-- The researched real-world thing (one per place/event; several drops can point at one)
create table if not exists public.pm_things (
	id                 uuid primary key default gen_random_uuid(),
	name               text not null,
	kind               text,
	lat                double precision,
	lng                double precision,
	address            text,
	status             text not null default 'researching' check (status in ('researching', 'ready', 'needs_answer', 'archived')),
	-- the engine reads these columns (set by research, or by hand; a hand edit is never overwritten)
	min_minutes        int,
	max_minutes        int,
	indoor             boolean,
	dog_rule           text not null default 'unknown' check (dog_rule in ('yes', 'no', 'outside_only', 'unknown')),
	cost_pence         int,
	image_path         text,
	summary            text,
	tags               text[] not null default '{}',
	best_time_of_day   text[] not null default '{}',
	seasons            text[] not null default '{}',
	-- person id → 0–3
	stars              jsonb not null default '{}'::jsonb,
	-- which columns a person set by hand (research leaves them alone)
	hand_edited        text[] not null default '{}',
	done_count         int not null default 0,
	last_researched_at timestamptz,
	next_recheck_at    timestamptz,
	old_id             text,
	created_at         timestamptz not null default now(),
	updated_at         timestamptz not null default now()
);
select app.register_table('pm_things', 'phirstmaxx', 'things');
create index if not exists pm_things_space_status on public.pm_things (space_id, status);
create unique index if not exists pm_things_old on public.pm_things (space_id, old_id) where old_id is not null;

-- The raw thing as it arrived. Immutable apart from the link to its thing and the one question.
create table if not exists public.pm_drops (
	id          uuid primary key default gen_random_uuid(),
	person_id   uuid not null references auth.users (id) on delete cascade,
	client_id   text not null,
	source      text not null default 'app' check (source in ('app', 'share_sheet', 'shortcut', 'telegram', 'inbox', 'import', 'capture')),
	url         text,
	text        text,
	media_paths text[] not null default '{}',
	received_at timestamptz not null default now(),
	thing_id    uuid references public.pm_things (id) on delete set null,
	question    text,
	answer      text,
	old_id      text,
	constraint pm_drops_something check (url is not null or text is not null or cardinality(media_paths) > 0)
);
select app.register_table('pm_drops', 'phirstmaxx', 'things');
-- the same client id twice is one drop (spec §2.1)
create unique index if not exists pm_drops_client_once on public.pm_drops (space_id, client_id);
create index if not exists pm_drops_thing on public.pm_drops (thing_id) where thing_id is not null;
create unique index if not exists pm_drops_old on public.pm_drops (space_id, old_id) where old_id is not null;

-- One row per fact per source. The screen shows the source beside every fact (spec §2.4).
create table if not exists public.pm_thing_facts (
	id             uuid primary key default gen_random_uuid(),
	thing_id       uuid not null references public.pm_things (id) on delete cascade,
	key            text not null,
	value          jsonb not null,
	source_url     text,
	source_kind    text not null check (source_kind in ('jsonld', 'official_site', 'opengraph', 'osm', 'google_places', 'web_search', 'youtube', 'oembed', 'vision', 'exif', 'person', 'estimate', 'import')),
	confidence     real not null default 0.5 check (confidence >= 0 and confidence <= 1),
	checked_at     timestamptz not null default now(),
	edited_by_user boolean not null default false
);
select app.register_table('pm_thing_facts', 'phirstmaxx', 'things', 'pm_things', 'thing_id');
create unique index if not exists pm_thing_facts_once on public.pm_thing_facts (thing_id, key, source_kind, coalesce(source_url, ''));
create index if not exists pm_thing_facts_thing_key on public.pm_thing_facts (thing_id, key);

-- Per drop per stage (spec §6): independent, re-runnable, with its cost
create table if not exists public.pm_research_runs (
	id          uuid primary key default gen_random_uuid(),
	drop_id     uuid not null references public.pm_drops (id) on delete cascade,
	stage       text not null check (stage in ('read', 'resolve', 'enrich', 'travel', 'fit', 'notify')),
	status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'skipped', 'waiting')),
	attempts    int not null default 0,
	error       text,
	started_at  timestamptz,
	finished_at timestamptz,
	run_after   timestamptz not null default now(),
	cost_pence  int not null default 0,
	provider    text,
	detail      jsonb not null default '{}'::jsonb,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);
select app.register_table('pm_research_runs', 'phirstmaxx', 'things', 'pm_drops', 'drop_id');
create unique index if not exists pm_research_runs_once on public.pm_research_runs (drop_id, stage);
create index if not exists pm_research_runs_due on public.pm_research_runs (run_after) where status in ('queued', 'failed');

-- Thing × start point × mode, cached (spec §6.4)
create table if not exists public.pm_travel (
	id              uuid primary key default gen_random_uuid(),
	thing_id        uuid not null references public.pm_things (id) on delete cascade,
	origin_place_id uuid not null references public.pm_places (id) on delete cascade,
	mode            text not null check (mode in ('drive', 'walk', 'cycle', 'transit')),
	minutes         int not null check (minutes >= 0),
	km              real,
	provider        text not null check (provider in ('google', 'ors', 'estimate', 'override')),
	fetched_at      timestamptz not null default now()
);
select app.register_table('pm_travel', 'phirstmaxx', 'things', 'pm_things', 'thing_id');
create unique index if not exists pm_travel_once on public.pm_travel (thing_id, origin_place_id, mode);

-- Outside calls counted per provider, product and calendar month (spec §11.2)
create table if not exists public.pm_api_calls (
	id       uuid primary key default gen_random_uuid(),
	provider text not null,
	product  text not null,
	month    text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
	count    int not null default 0
);
select app.register_table('pm_api_calls', 'phirstmaxx', 'things');
create unique index if not exists pm_api_calls_once on public.pm_api_calls (space_id, provider, product, month);

-- ---------------------------------------------------------------------
-- 4. phirstmaxx.plans
-- ---------------------------------------------------------------------
create table if not exists public.pm_plans (
	id                uuid primary key default gen_random_uuid(),
	kind              text not null default 'plan' check (kind in ('hold', 'plan')),
	thing_id          uuid references public.pm_things (id) on delete set null,
	title             text not null,
	starts_at         timestamptz not null,
	ends_at           timestamptz not null,
	status            text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined', 'expired', 'done', 'cancelled')),
	-- a person id, or 'engine'
	proposed_by       text not null,
	-- the family_entries row once accepted (lib/phirstmaxx/adapter.ts owns the write)
	calendar_entry_id uuid,
	notes             text,
	score             jsonb,
	-- unanswered proposals expire at the window start (spec §7)
	expires_at        timestamptz,
	-- "conflicts now": set when a block change breaks an accepted plan
	conflict          text,
	old_id            text,
	created_at        timestamptz not null default now(),
	updated_at        timestamptz not null default now(),
	constraint pm_plans_ends_after_start check (ends_at > starts_at)
);
select app.register_table('pm_plans', 'phirstmaxx', 'plans');
create index if not exists pm_plans_space_time on public.pm_plans (space_id, starts_at);
create unique index if not exists pm_plans_old on public.pm_plans (space_id, old_id) where old_id is not null;

create table if not exists public.pm_plan_responses (
	id        uuid primary key default gen_random_uuid(),
	plan_id   uuid not null references public.pm_plans (id) on delete cascade,
	person_id uuid not null references auth.users (id) on delete cascade,
	answer    text not null check (answer in ('yes', 'no', 'another_time')),
	at        timestamptz not null default now()
);
select app.register_table('pm_plan_responses', 'phirstmaxx', 'plans', 'pm_plans', 'plan_id');
create unique index if not exists pm_plan_responses_once on public.pm_plan_responses (plan_id, person_id);

create table if not exists public.pm_plan_legs (
	id         uuid primary key default gen_random_uuid(),
	plan_id    uuid not null references public.pm_plans (id) on delete cascade,
	person_id  uuid not null references auth.users (id) on delete cascade,
	position   int not null default 0,
	kind       text not null check (kind in ('leave', 'travel', 'arrive', 'there', 'home')),
	from_label text,
	to_label   text,
	starts_at  timestamptz not null,
	ends_at    timestamptz not null,
	minutes    int not null default 0,
	mode       text check (mode is null or mode in ('drive', 'walk', 'cycle', 'transit')),
	provider   text check (provider is null or provider in ('google', 'ors', 'estimate', 'override'))
);
select app.register_table('pm_plan_legs', 'phirstmaxx', 'plans', 'pm_plans', 'plan_id');
create index if not exists pm_plan_legs_plan on public.pm_plan_legs (plan_id, person_id, position);

-- Every notification is also a row here, so a missed push loses nothing (spec §7)
create table if not exists public.pm_notifications (
	id         uuid primary key default gen_random_uuid(),
	person_id  uuid not null references auth.users (id) on delete cascade,
	kind       text not null,
	title      text not null,
	body       text,
	url        text,
	plan_id    uuid references public.pm_plans (id) on delete cascade,
	thing_id   uuid references public.pm_things (id) on delete cascade,
	drop_id    uuid references public.pm_drops (id) on delete cascade,
	sent_via   text,
	read_at    timestamptz,
	created_at timestamptz not null default now()
);
select app.register_table('pm_notifications', 'phirstmaxx', 'plans');
create index if not exists pm_notifications_inbox on public.pm_notifications (space_id, person_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. pm_save_blocks: a painted week in one transaction (spec §4)
-- ---------------------------------------------------------------------
-- p_ranges: [{"start": iso, "end": iso}, ...] — half-hour aligned instants.
-- p_repeat_until: weekly copies of every range up to and including this
--                 London date, under one series_id.
-- p_policy: 'replace' — existing blocks of this person under a new range
--                       are cut away (deleted, shortened or split);
--           'trim'    — the new range is cut around existing blocks instead.
-- Runs as the caller (security invoker): RLS decides whether they may write
-- this space. Everything removed or shortened is kept in pm_undo under the
-- returned batch id.
create or replace function public.pm_save_blocks(
	p_space        uuid,
	p_person       uuid,
	p_ranges       jsonb,
	p_type         uuid,
	p_firmness     text,
	p_place        uuid default null,
	p_title        text default null,
	p_repeat_until date default null,
	p_policy       text default 'replace'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_batch     uuid := gen_random_uuid();
	v_series    uuid := case when p_repeat_until is not null then gen_random_uuid() else null end;
	v_kind      text;
	v_me        uuid := auth.uid();
	v_r         jsonb;
	v_s         timestamptz;
	v_e         timestamptz;
	v_week      int;
	v_weeks     int := 0;
	v_snapshot  jsonb := '[]'::jsonb;
	v_created   int := 0;
	v_removed   int := 0;
	v_trimmed   int := 0;
	v_pieces    tstzrange[];
	v_piece     tstzrange;
	v_cut       tstzrange;
	v_b         record;
	v_new_ids   uuid[] := '{}';
	v_id        uuid;
begin
	if p_policy not in ('replace', 'trim') then
		raise exception 'policy is replace or trim';
	end if;
	if p_firmness not in ('firm', 'flexible') then
		raise exception 'firmness is firm or flexible';
	end if;
	select engine_kind into v_kind from public.pm_block_types where id = p_type and space_id = p_space;
	if v_kind is null then
		raise exception 'That block type is not in this space.';
	end if;
	if jsonb_typeof(p_ranges) <> 'array' or jsonb_array_length(p_ranges) = 0 then
		raise exception 'Nothing highlighted.';
	end if;
	if p_repeat_until is not null then
		-- how many weekly copies after the first (capped at a year)
		select least(52, greatest(0, floor(((p_repeat_until::timestamptz at time zone 'Europe/London') - (min((r->>'start')::timestamptz) at time zone 'Europe/London')) / interval '7 days')::int))
		into v_weeks
		from jsonb_array_elements(p_ranges) r;
	end if;

	for v_week in 0..v_weeks loop
		for v_r in select * from jsonb_array_elements(p_ranges) loop
			-- a weekly copy keeps the London wall-clock time across a clock change
			v_s := (((v_r->>'start')::timestamptz at time zone 'Europe/London') + make_interval(days => 7 * v_week)) at time zone 'Europe/London';
			v_e := (((v_r->>'end')::timestamptz at time zone 'Europe/London') + make_interval(days => 7 * v_week)) at time zone 'Europe/London';
			if v_e <= v_s then
				raise exception 'A range ends after it starts.';
			end if;
			if (extract(epoch from v_s)::bigint % 1800) <> 0 or (extract(epoch from v_e)::bigint % 1800) <> 0 then
				raise exception 'Ranges are in half hours.';
			end if;

			v_pieces := array[tstzrange(v_s, v_e, '[)')];

			for v_b in
				select * from public.pm_blocks
				where space_id = p_space and person_id = p_person
				  and starts_at < v_e and ends_at > v_s
				  and not (id = any(v_new_ids))
				order by starts_at
			loop
				v_cut := tstzrange(v_b.starts_at, v_b.ends_at, '[)');
				if p_policy = 'replace' then
					-- the existing block gives way: delete it, keep what lies outside the new range.
					-- Only here does the old block change, so only here is it kept for undo;
					-- a trim leaves it as it was.
					v_snapshot := v_snapshot || to_jsonb(v_b);
					delete from public.pm_blocks where id = v_b.id;
					v_removed := v_removed + 1;
					if v_b.starts_at < v_s then
						insert into public.pm_blocks (space_id, created_by, person_id, entered_by, type_id, engine_kind, starts_at, ends_at, firmness, place_id, title, series_id, local, undo_batch, old_id)
						values (p_space, v_b.created_by, v_b.person_id, v_b.entered_by, v_b.type_id, v_b.engine_kind, v_b.starts_at, v_s, v_b.firmness, v_b.place_id, v_b.title, v_b.series_id, v_b.local, v_batch, null)
						returning id into v_id;
						v_new_ids := v_new_ids || v_id;
						v_trimmed := v_trimmed + 1;
					end if;
					if v_b.ends_at > v_e then
						insert into public.pm_blocks (space_id, created_by, person_id, entered_by, type_id, engine_kind, starts_at, ends_at, firmness, place_id, title, series_id, local, undo_batch, old_id)
						values (p_space, v_b.created_by, v_b.person_id, v_b.entered_by, v_b.type_id, v_b.engine_kind, v_e, v_b.ends_at, v_b.firmness, v_b.place_id, v_b.title, v_b.series_id, v_b.local, v_batch, null)
						returning id into v_id;
						v_new_ids := v_new_ids || v_id;
						v_trimmed := v_trimmed + 1;
					end if;
				else
					-- trim: the new range is cut around the existing block
					v_pieces := (
						select coalesce(array_agg(x), '{}')
						from (
							-- what is left of the piece on either side of the block; a side the block
							-- runs past is empty, never an inverted range
							select unnest(array[
								case when lower(p) < lower(v_cut) then tstzrange(lower(p), lower(v_cut), '[)') else 'empty'::tstzrange end,
								case when upper(v_cut) < upper(p) then tstzrange(upper(v_cut), upper(p), '[)') else 'empty'::tstzrange end
							]) as x
							from unnest(v_pieces) p
							where p && v_cut
							union all
							select p from unnest(v_pieces) p where not (p && v_cut)
						) s
						where not isempty(x)
					);
				end if;
			end loop;

			foreach v_piece in array v_pieces loop
				insert into public.pm_blocks (space_id, created_by, person_id, entered_by, type_id, engine_kind, starts_at, ends_at, firmness, place_id, title, series_id, local, undo_batch)
				values (p_space, v_me, p_person, v_me, p_type, v_kind, lower(v_piece), upper(v_piece), p_firmness, p_place, nullif(trim(p_title), ''), v_series, true, v_batch)
				returning id into v_id;
				v_new_ids := v_new_ids || v_id;
				v_created := v_created + 1;
			end loop;
		end loop;
	end loop;

	-- adjacent blocks of the same shape become one (spec §4: "adjacent slots of the same type merge")
	loop
		select a.id as keep, b.id as drop_id, b.ends_at as new_end into v_b
		from public.pm_blocks a
		join public.pm_blocks b
		  on b.space_id = a.space_id and b.person_id = a.person_id
		 and b.starts_at = a.ends_at
		 and b.type_id = a.type_id and b.firmness = a.firmness
		 and coalesce(b.place_id, '00000000-0000-0000-0000-000000000000') = coalesce(a.place_id, '00000000-0000-0000-0000-000000000000')
		 and coalesce(b.title, '') = coalesce(a.title, '')
		 and coalesce(b.series_id, '00000000-0000-0000-0000-000000000000') = coalesce(a.series_id, '00000000-0000-0000-0000-000000000000')
		where a.space_id = p_space and a.person_id = p_person
		  and (a.id = any(v_new_ids) or b.id = any(v_new_ids))
		limit 1;
		exit when not found;
		-- the one being folded in may be an old block: keep it for undo
		if not (v_b.drop_id = any(v_new_ids)) then
			v_snapshot := v_snapshot || (select to_jsonb(x) from public.pm_blocks x where x.id = v_b.drop_id);
		end if;
		if not (v_b.keep = any(v_new_ids)) then
			v_snapshot := v_snapshot || (select to_jsonb(x) from public.pm_blocks x where x.id = v_b.keep);
		end if;
		update public.pm_blocks set ends_at = v_b.new_end, undo_batch = v_batch, updated_at = now() where id = v_b.keep;
		delete from public.pm_blocks where id = v_b.drop_id;
		v_new_ids := array_remove(v_new_ids, v_b.drop_id);
		if not (v_b.keep = any(v_new_ids)) then v_new_ids := v_new_ids || v_b.keep; end if;
	end loop;

	insert into public.pm_undo (space_id, created_by, batch_id, person_id, snapshot)
	values (p_space, v_me, v_batch, p_person, v_snapshot);

	return jsonb_build_object('batch_id', v_batch, 'created', v_created, 'removed', v_removed, 'trimmed', v_trimmed, 'series_id', v_series, 'weeks', v_weeks + 1);
end
$$;
revoke all on function public.pm_save_blocks(uuid, uuid, jsonb, uuid, text, uuid, text, date, text) from public;
grant execute on function public.pm_save_blocks(uuid, uuid, jsonb, uuid, text, uuid, text, date, text) to authenticated, service_role;

-- Put a save back: the blocks it made go, the ones it removed or shortened return as they were. Ten minutes.
create or replace function public.pm_undo_blocks(p_space uuid, p_batch uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_u       record;
	v_row     jsonb;
	v_removed int := 0;
	v_back    int := 0;
begin
	select * into v_u from public.pm_undo where batch_id = p_batch and space_id = p_space;
	if not found then
		raise exception 'Nothing to undo.';
	end if;
	if v_u.created_at < now() - interval '10 minutes' then
		delete from public.pm_undo where batch_id = p_batch;
		raise exception 'Too late to undo that save.';
	end if;
	delete from public.pm_blocks where space_id = p_space and undo_batch = p_batch;
	get diagnostics v_removed = row_count;
	for v_row in select * from jsonb_array_elements(v_u.snapshot) loop
		insert into public.pm_blocks (id, space_id, created_by, person_id, entered_by, type_id, engine_kind, starts_at, ends_at, firmness, place_id, title, series_id, local, undo_batch, old_id, created_at, updated_at)
		values (
			(v_row->>'id')::uuid, p_space, nullif(v_row->>'created_by', '')::uuid, (v_row->>'person_id')::uuid, nullif(v_row->>'entered_by', '')::uuid,
			(v_row->>'type_id')::uuid, v_row->>'engine_kind', (v_row->>'starts_at')::timestamptz, (v_row->>'ends_at')::timestamptz,
			v_row->>'firmness', nullif(v_row->>'place_id', '')::uuid, v_row->>'title', nullif(v_row->>'series_id', '')::uuid,
			coalesce((v_row->>'local')::boolean, true), nullif(v_row->>'undo_batch', '')::uuid, v_row->>'old_id',
			coalesce((v_row->>'created_at')::timestamptz, now()), now())
		on conflict (id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = now();
		v_back := v_back + 1;
	end loop;
	delete from public.pm_undo where batch_id = p_batch;
	return jsonb_build_object('removed', v_removed, 'restored', v_back);
end
$$;
revoke all on function public.pm_undo_blocks(uuid, uuid) from public;
grant execute on function public.pm_undo_blocks(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Seeds: the starter block types and a pm_people row per member
-- ---------------------------------------------------------------------
create or replace function public.pm_seed_space(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_team uuid;
begin
	-- only a member of the space's team may seed it
	select team_id into v_team from public.spaces where id = p_space;
	if v_team is null or not exists (select 1 from public.team_members where team_id = v_team and user_id = auth.uid()) then
		raise exception 'Not your space.';
	end if;
	insert into public.pm_block_types (space_id, created_by, name, engine_kind, colour, default_firmness, is_seed, sort)
	select p_space, auth.uid(), x.name, x.kind, x.colour, x.firmness, true, x.ord
	from (values
		('Work',  'work',  '#7d8a9e', 'firm',     1),
		('Shift', 'shift', '#6f7f99', 'firm',     2),
		('Busy',  'busy',  '#8a8a8a', 'firm',     3),
		('Free',  'free',  '#5fae7a', 'flexible', 4),
		('Walk',  'walk',  '#d6a24a', 'firm',     5),
		('Sit',   'sit',   '#c98a3a', 'firm',     6),
		('Faith', 'faith', '#9a7fd1', 'firm',     7)
	) as x(name, kind, colour, firmness, ord)
	on conflict do nothing;
	insert into public.pm_people (space_id, created_by, person_id, name, colour)
	select p_space, auth.uid(), m.user_id,
		coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1), 'Someone'),
		case row_number() over (order by m.user_id) % 3 when 1 then '#7aa2f7' when 2 then '#f5b56d' else '#9a7fd1' end
	from public.team_members m
	join auth.users u on u.id = m.user_id
	left join public.profiles p on p.id = m.user_id
	where m.team_id = v_team
	on conflict do nothing;
end
$$;
revoke all on function public.pm_seed_space(uuid) from public;
grant execute on function public.pm_seed_space(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Outside calls counted per month; refused past the cap
-- ---------------------------------------------------------------------
create or replace function public.pm_count_api_call(p_space uuid, p_provider text, p_product text, p_cap int)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_month text := to_char(now() at time zone 'Europe/London', 'YYYY-MM');
	v_count int;
begin
	insert into public.pm_api_calls (space_id, created_by, provider, product, month, count)
	values (p_space, auth.uid(), p_provider, p_product, v_month, 0)
	on conflict (space_id, provider, product, month) do nothing;
	select count into v_count from public.pm_api_calls
	where space_id = p_space and provider = p_provider and product = p_product and month = v_month
	for update;
	if v_count >= p_cap then
		return false;
	end if;
	update public.pm_api_calls set count = count + 1
	where space_id = p_space and provider = p_provider and product = p_product and month = v_month;
	return true;
end
$$;
revoke all on function public.pm_count_api_call(uuid, text, text, int) from public;
grant execute on function public.pm_count_api_call(uuid, text, text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. Storage: the pictures dropped in (spec §5), one folder per space
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('phirstmaxx', 'phirstmaxx', false)
on conflict (id) do nothing;

drop policy if exists "phirstmaxx files read"   on storage.objects;
drop policy if exists "phirstmaxx files write"  on storage.objects;
drop policy if exists "phirstmaxx files delete" on storage.objects;
create policy "phirstmaxx files read" on storage.objects for select to authenticated
using (
	bucket_id = 'phirstmaxx'
	and app.uuid_or_null((storage.foldername(name))[1]) in (select app.accessible_spaces('phirstmaxx.things', 'view'))
);
create policy "phirstmaxx files write" on storage.objects for insert to authenticated
with check (
	bucket_id = 'phirstmaxx'
	and app.uuid_or_null((storage.foldername(name))[1]) in (select app.accessible_spaces('phirstmaxx.things', 'create_delete'))
);
create policy "phirstmaxx files delete" on storage.objects for delete to authenticated
using (
	bucket_id = 'phirstmaxx'
	and app.uuid_or_null((storage.foldername(name))[1]) in (select app.accessible_spaces('phirstmaxx.things', 'create_delete'))
);

-- ---------------------------------------------------------------------
-- 9. Self-check
-- ---------------------------------------------------------------------
do $$
declare
	t text;
	n int;
begin
	foreach t in array array['pm_people', 'pm_places', 'pm_block_types', 'pm_blocks', 'pm_waking', 'pm_patterns', 'pm_undo', 'pm_pets',
		'pm_drops', 'pm_things', 'pm_thing_facts', 'pm_research_runs', 'pm_travel', 'pm_api_calls',
		'pm_plans', 'pm_plan_responses', 'pm_plan_legs', 'pm_notifications'] loop
		if not exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relname = t and c.relrowsecurity) then
			raise exception '0185: % has no RLS', t;
		end if;
		select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
		if n < 4 then
			raise exception '0185: % has % policies', t, n;
		end if;
		if not exists (select 1 from public.entity_groups where table_name = t and section = 'phirstmaxx') then
			raise exception '0185: % is not in entity_groups', t;
		end if;
	end loop;
	if not exists (select 1 from pg_constraint where conname = 'team_member_sections_section_check' and pg_get_constraintdef(oid) like '%phirstmaxx%') then
		raise exception '0185: team_member_sections does not admit phirstmaxx';
	end if;
	if not exists (select 1 from pg_constraint where conname = 'user_grants_section_shape' and pg_get_constraintdef(oid) like '%phirstmaxx%') then
		raise exception '0185: user_grants does not admit phirstmaxx';
	end if;
	if not exists (select 1 from pg_constraint where conname = 'entity_groups_section_check' and pg_get_constraintdef(oid) like '%phirstmaxx%') then
		raise exception '0185: entity_groups does not admit phirstmaxx';
	end if;
	if not exists (select 1 from pg_constraint where conname = 'rundown_settings_sections_shape' and pg_get_constraintdef(oid) like '%phirstmaxx%') then
		raise exception '0185: rundown_settings does not admit phirstmaxx';
	end if;
	if not exists (select 1 from storage.buckets where id = 'phirstmaxx') then
		raise exception '0185: the phirstmaxx bucket is missing';
	end if;
end $$;
