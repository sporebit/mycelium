-- 0149_people_review.sql
-- People review (MYC-175, claude/people-review-spec.md): archive a person
-- (hidden, never matched, history kept) and a learned ignore list of terms
-- that are never people. The ignore list is adopted into spaces under
-- organisation.people with the 0111 policy + grant loop inlined for this
-- table (the 0124 lesson). Nothing is backfilled: the 62 people waiting
-- for review are cleared through the new UI, which seeds the list.
-- Depends on: 0148.

-- ---------------------------------------------------------------------
-- 1. people.archived_at (R3)
-- ---------------------------------------------------------------------
alter table public.people add column if not exists archived_at timestamptz;

create index if not exists people_live_active_idx
	on public.people (space_id, tier)
	where deleted_at is null and archived_at is null;

create index if not exists people_archived_idx
	on public.people (space_id, archived_at desc)
	where archived_at is not null;

-- ---------------------------------------------------------------------
-- 2. people_ignored_terms (R4): exact, case-insensitive terms that never
--    become a person. term_key = aliasKey() (trimmed, single-spaced,
--    lowercased); term_raw is how the user last saw it.
-- ---------------------------------------------------------------------
create table if not exists public.people_ignored_terms (
	id          uuid primary key default gen_random_uuid(),
	term_key    text not null,
	term_raw    text not null,
	source      text not null check (source in ('reject', 'manual', 'pending')),
	person_id   uuid references public.people(id) on delete set null,
	created_at  timestamptz not null default now()
);

select app.adopt_table('people_ignored_terms');
alter table public.people_ignored_terms enable row level security;

create unique index if not exists people_ignored_terms_space_key_idx
	on public.people_ignored_terms (space_id, term_key);
create index if not exists people_ignored_terms_person_idx
	on public.people_ignored_terms (person_id)
	where person_id is not null;
create index if not exists people_ignored_terms_recent_idx
	on public.people_ignored_terms (space_id, created_at desc);

insert into public.entity_groups (table_name, section, entity_group)
values ('people_ignored_terms', 'organisation', 'people')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

-- the 0111 policy + grant loop, for this table only
do $$
declare
	r    record;
	k    text;
begin
	for r in select table_name, section, entity_group from public.entity_groups where table_name = 'people_ignored_terms' loop
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

-- ---------------------------------------------------------------------
-- 3. people_ignored_terms.person_id is bookkeeping ("the rejected person
--    these words came from"), not a link: it is one of the person's own
--    tables for the 0140 walkers (promote-on-link, merge, linked counts).
-- ---------------------------------------------------------------------
create or replace function public.people_link_tables()
returns table (table_name text, column_name text)
language sql
stable
set search_path = ''
as $$
	select cl.relname::text, a.attname::text
	from pg_constraint c
	join pg_class cl on cl.oid = c.conrelid
	join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
	where c.contype = 'f'
	  and c.confrelid = 'public.people'::regclass
	  and cl.relname not in ('people', 'people_aliases', 'person_phones', 'person_emails', 'person_vcards', 'people_import_candidates', 'people_ignored_terms')
	order by 1, 2
$$;

-- ---------------------------------------------------------------------
-- 4. the day-log stats view sees live, unarchived persons only (R3)
-- ---------------------------------------------------------------------
create or replace view public.people_daylog_stats
	with (security_invoker = true)
	as
	select
		sp.person_id,
		count(distinct d.day)::int as days_together,
		min(d.day) as first_seen,
		max(d.day) as last_seen
	from public.daylog_scene_people sp
	join public.daylog_scenes s on s.id = sp.scene_id
	join public.daylog_days d on d.id = s.day_id
	join public.people p on p.id = sp.person_id and p.deleted_at is null and p.archived_at is null and p.tier = 'person'
	group by sp.person_id;
