-- 0127_daylog.sql
-- Day log (Journal v2) — claude/daylog-spec.md §3. Part A schema: the five
-- tables, the people link columns (unused until Part E), the entity group
-- `journal.daylog`, the 0111 policy + grant loop inlined for the new tables
-- (the 0124 lesson), the RLS-native linked-user read policies exactly as §3,
-- and the 0003 journal migrated in (§4.5: one day row per entry-date, mode
-- 'legacy', the old table kept for one release). Depends on: 0126.
--
-- Deviation: no pg_trgm on the hosted project (see 0126), so the
-- daylog_facts_text_trgm index is omitted; search is done in the app.

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------
create table if not exists public.daylog_days (
	id                      uuid primary key default gen_random_uuid(),
	day                     date not null,
	status                  text not null default 'pending'
		check (status in ('pending', 'prompted', 'open', 'closing', 'closed', 'skipped')),
	mode                    text check (mode in ('talk', 'quick', 'skip', 'legacy')),
	persona_agent_id        uuid,
	transcript              jsonb not null default '[]',
	summary                 text,
	summary_edited_by_user  boolean not null default false,
	extraction              jsonb not null default '{}',
	extraction_version      int not null default 1,
	seeds                   jsonb,
	scores                  jsonb not null default '{}',
	open_thread             text,
	open_thread_asked_at    timestamptz,
	turn_count              int not null default 0,
	cost_pence              numeric(8,2) not null default 0,
	prompted_at             timestamptz,
	snoozed_until           timestamptz,
	last_activity_at        timestamptz,
	closed_at               timestamptz,
	legacy_journal_id       uuid,
	created_at              timestamptz not null default now(),
	updated_at              timestamptz not null default now()
);

create table if not exists public.daylog_scenes (
	id                          uuid primary key default gen_random_uuid(),
	day_id                      uuid not null references public.daylog_days(id) on delete cascade,
	position                    int not null,
	title                       text not null,
	place_id                    uuid references public.places(id) on delete set null,
	place_text                  text,
	time_hint                   text,
	narrative                   text,
	narrative_edited_by_user    boolean not null default false,
	hidden_from_linked          boolean not null default false,
	created_at                  timestamptz not null default now(),
	updated_at                  timestamptz not null default now()
);
create index if not exists daylog_scenes_day on public.daylog_scenes (day_id, position);

create table if not exists public.daylog_scene_people (
	id          uuid primary key default gen_random_uuid(),
	scene_id    uuid not null references public.daylog_scenes(id) on delete cascade,
	person_id   uuid not null references public.people(id) on delete cascade,
	unique (scene_id, person_id)
);
create index if not exists daylog_scene_people_person on public.daylog_scene_people (person_id);

create table if not exists public.daylog_facts (
	id                  uuid primary key default gen_random_uuid(),
	day_id              uuid not null references public.daylog_days(id) on delete cascade,
	scene_id            uuid references public.daylog_scenes(id) on delete set null,
	kind                text not null check (kind in
		('food', 'drink', 'spend', 'event', 'milestone', 'person_fact', 'place_fact', 'media', 'health', 'other')),
	subject_person_id   uuid references public.people(id) on delete set null,
	text                text not null,
	data                jsonb,
	confidence          text not null default 'stated' check (confidence in ('stated', 'inferred')),
	edited_by_user      boolean not null default false,
	created_at          timestamptz not null default now(),
	updated_at          timestamptz not null default now()
);
create index if not exists daylog_facts_day on public.daylog_facts (day_id);
create index if not exists daylog_facts_person on public.daylog_facts (subject_person_id) where subject_person_id is not null;

create table if not exists public.daylog_media (
	id              uuid primary key default gen_random_uuid(),
	day_id          uuid not null references public.daylog_days(id) on delete cascade,
	scene_id        uuid references public.daylog_scenes(id) on delete set null,
	storage_path    text not null,
	taken_at        timestamptz,
	caption         text,
	shareable       boolean not null default false,
	created_at      timestamptz not null default now()
);

-- scores: every value an integer 1–5 (§3, decision 14a)
create or replace function app.daylog_scores_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
	select p is not null
	   and jsonb_typeof(p) = 'object'
	   and coalesce((select bool_and(v ~ '^[1-5]$') from jsonb_each_text(p) as e(k, v)), true);
$$;
alter table public.daylog_days drop constraint if exists daylog_days_scores_valid;
alter table public.daylog_days add constraint daylog_days_scores_valid check (app.daylog_scores_valid(scores));

-- settings: behaviour, not UI → user_settings (spec §3 rules)
alter table public.user_settings add column if not exists daylog jsonb not null default '{}';

-- decision 26: link a People row to another Mycelium user (used by Part E)
alter table public.people add column if not exists linked_user_id uuid references auth.users(id) on delete set null;
alter table public.people add column if not exists linked_at timestamptz;
create unique index if not exists people_linked_user on public.people (space_id, linked_user_id) where linked_user_id is not null;

-- ---------------------------------------------------------------------------
-- adopt into spaces (space_id / created_by), RLS, group, policies
-- ---------------------------------------------------------------------------
select app.adopt_table('daylog_days');
select app.adopt_table('daylog_scenes', 'daylog_days', 'day_id');
select app.adopt_table('daylog_scene_people', 'daylog_scenes', 'scene_id');
select app.adopt_table('daylog_facts', 'daylog_days', 'day_id');
select app.adopt_table('daylog_media', 'daylog_days', 'day_id');

create unique index if not exists daylog_days_one_per_user_day on public.daylog_days (space_id, created_by, day);
create index if not exists daylog_days_space_day on public.daylog_days (space_id, day desc);

alter table public.daylog_days enable row level security;
alter table public.daylog_scenes enable row level security;
alter table public.daylog_scene_people enable row level security;
alter table public.daylog_facts enable row level security;
alter table public.daylog_media enable row level security;

insert into public.entity_groups (table_name, section, entity_group) values
	('daylog_days', 'journal', 'daylog'),
	('daylog_scenes', 'journal', 'daylog'),
	('daylog_scene_people', 'journal', 'daylog'),
	('daylog_facts', 'journal', 'daylog'),
	('daylog_media', 'journal', 'daylog')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

-- the 0111 policy + grant loop, for these tables only
do $$
declare
	r    record;
	k    text;
begin
	for r in select table_name, section, entity_group from public.entity_groups where entity_group = 'daylog' and section = 'journal' loop
		k := r.section || '.' || r.entity_group;
		execute format('drop policy if exists "deny all" on public.%I', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_select', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_insert', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_update', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_delete', r.table_name);
		execute format('create policy %I on public.%I for select to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_select', r.table_name, k, 'view');
		execute format('create policy %I on public.%I for insert to authenticated with check (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_insert', r.table_name, k, 'create_delete');
		execute format('create policy %I on public.%I for update to authenticated using (space_id in (select app.accessible_spaces(%L, %L))) with check (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_update', r.table_name, k, 'edit', k, 'edit');
		execute format('create policy %I on public.%I for delete to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_delete', r.table_name, k, 'create_delete');
		execute format('grant select, insert, update, delete on public.%I to authenticated', r.table_name);
		execute format('alter table public.%I alter column space_id set default app.personal_space()', r.table_name);
		execute format('alter table public.%I alter column created_by set default auth.uid()', r.table_name);
	end loop;
end
$$;

-- decision 30: the linked-user read path, RLS-native. Scenes (not hidden)
-- that the viewer's linked person was in; the membership rows of a visible
-- scene; shareable media of a visible scene. Never the day row or a fact.
drop policy if exists daylog_scenes_linked_select on public.daylog_scenes;
create policy daylog_scenes_linked_select on public.daylog_scenes for select to authenticated
using (
	not hidden_from_linked
	and exists (
		select 1 from public.daylog_scene_people sp
		join public.people p on p.id = sp.person_id
		where sp.scene_id = daylog_scenes.id and p.linked_user_id = auth.uid()
	)
);
drop policy if exists daylog_scene_people_linked_select on public.daylog_scene_people;
create policy daylog_scene_people_linked_select on public.daylog_scene_people for select to authenticated
using (
	exists (
		select 1 from public.daylog_scenes s
		join public.daylog_scene_people sp2 on sp2.scene_id = s.id
		join public.people p on p.id = sp2.person_id
		where s.id = daylog_scene_people.scene_id and not s.hidden_from_linked and p.linked_user_id = auth.uid()
	)
);
drop policy if exists daylog_media_linked_select on public.daylog_media;
create policy daylog_media_linked_select on public.daylog_media for select to authenticated
using (
	shareable
	and exists (
		select 1 from public.daylog_scenes s
		join public.daylog_scene_people sp on sp.scene_id = s.id
		join public.people p on p.id = sp.person_id
		where s.id = daylog_media.scene_id and not s.hidden_from_linked and p.linked_user_id = auth.uid()
	)
);

-- ---------------------------------------------------------------------------
-- §4.5 migrate the 0003 journal: one day row per (space, user, entry_date);
-- two entries on a day → both appended to the same transcript in order.
-- The old table stays for one release.
-- ---------------------------------------------------------------------------
insert into public.daylog_days (space_id, created_by, day, status, mode, transcript, summary, extraction, closed_at, last_activity_at, legacy_journal_id, created_at, updated_at)
select
	j.space_id,
	j.created_by,
	j.entry_date,
	'closed',
	'legacy',
	jsonb_agg(jsonb_build_object('role', 'user', 'at', j.created_at, 'text', j.raw_text, 'channel', 'legacy', 'legacy_journal_id', j.id, 'audio_url', j.audio_url) order by j.created_at),
	(array_remove(array_agg(j.summary order by j.created_at desc), null))[1],
	jsonb_build_object('legacy', true, 'moods', array_remove(array_agg(j.mood order by j.created_at), null)),
	max(j.created_at),
	max(j.created_at),
	(array_agg(j.id order by j.created_at))[1],
	min(j.created_at),
	max(j.created_at)
from public.journal_entries j
where j.deleted_at is null
group by j.space_id, j.created_by, j.entry_date
on conflict (space_id, created_by, day) do nothing;
