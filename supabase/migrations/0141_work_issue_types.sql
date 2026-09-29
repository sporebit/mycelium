-- 0141_work_issue_types.sql
-- Work redesign (MYC-174, claude/spec-work.md §2.2) — issue types and the
-- Epic → Story/Task/Bug → Sub-task hierarchy (W5, W6).
--
--   • app.register_table()   — adopt + RLS + deny-all + service_role grant +
--                              entity group + the 0111 policy/grant loop, in
--                              one call, so no new table can miss a step
--                              (the 0124 lesson). Used by 0141–0146.
--   • issue_types            — per space, editable; level 1 Epic, 0 standard,
--                              -1 Sub-task; legacy_kind = the tickets.kind a
--                              type carries (the steps engine reads kind)
--   • project_issue_types    — the types a project offers (no rows = all)
--   • tickets.type_id        — the issue type; habits never get one (W14)
--   • tickets.epic_id        — a standard issue's Epic, same project
--   • tickets_01_sync_type   — old paths write kind, Work writes type_id;
--                              each follows the other
--   • tickets_02_check_epic  — an epic link must point at an Epic in the
--                              same project
-- Trigger names carry a number because Postgres fires same-event triggers
-- in name order and these must run before tickets_sync_status.
-- Depends on: 0140.

-- ---------------------------------------------------------------------
-- 1. One call to bring a new table under the space wall
-- ---------------------------------------------------------------------
create or replace function app.register_table(
	p_table        text,
	p_section      text,
	p_group        text,
	p_parent_table text default null,
	p_parent_col   text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
	k text := p_section || '.' || p_group;
begin
	if p_section in ('finance', 'platform') then
		raise exception 'register_table(%): owner-only sections are not handled here', p_table;
	end if;
	perform app.adopt_table(p_table, p_parent_table, p_parent_col);
	execute format('alter table public.%I enable row level security', p_table);
	-- closed first: if anything below fails the table is unreadable, not open
	execute format('drop policy if exists "deny all" on public.%I', p_table);
	execute format('create policy "deny all" on public.%I as restrictive using (false)', p_table);
	execute format('grant all on public.%I to service_role', p_table);

	insert into public.entity_groups (table_name, section, entity_group)
	values (p_table, p_section, p_group)
	on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

	-- the 0111 policy + grant loop, for this table
	execute format('drop policy if exists "deny all" on public.%I', p_table);
	execute format('drop policy if exists %I on public.%I', p_table || '_select', p_table);
	execute format('drop policy if exists %I on public.%I', p_table || '_insert', p_table);
	execute format('drop policy if exists %I on public.%I', p_table || '_update', p_table);
	execute format('drop policy if exists %I on public.%I', p_table || '_delete', p_table);
	execute format('create policy %I on public.%I for select to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
		p_table || '_select', p_table, k, 'view');
	execute format('create policy %I on public.%I for insert to authenticated with check (space_id in (select app.accessible_spaces(%L, %L)))',
		p_table || '_insert', p_table, k, 'create_delete');
	execute format('create policy %I on public.%I for update to authenticated using (space_id in (select app.accessible_spaces(%L, %L))) with check (space_id in (select app.accessible_spaces(%L, %L)))',
		p_table || '_update', p_table, k, 'edit', k, 'edit');
	execute format('create policy %I on public.%I for delete to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
		p_table || '_delete', p_table, k, 'create_delete');
	execute format('grant select, insert, update, delete on public.%I to authenticated', p_table);
	execute format('alter table public.%I alter column space_id set default app.personal_space()', p_table);
	execute format('alter table public.%I alter column created_by set default auth.uid()', p_table);
end
$$;
revoke all on function app.register_table(text, text, text, text, text) from public;

-- ---------------------------------------------------------------------
-- 2. Issue types
-- ---------------------------------------------------------------------
create table if not exists public.issue_types (
	id          uuid primary key default gen_random_uuid(),
	name        text not null,
	slug        text not null check (slug ~ '^[a-z][a-z0-9-]{0,31}$'),
	level       smallint not null default 0 check (level in (1, 0, -1)),
	legacy_kind text check (legacy_kind in ('task', 'runbook', 'test', 'guide', 'audit', 'setup')),
	has_steps   boolean not null default false,
	icon        text,
	colour      text,
	sort_order  int not null default 0,
	archived_at timestamptz,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);
select app.register_table('issue_types', 'organisation', 'tickets');
create unique index if not exists issue_types_slug_per_space on public.issue_types (space_id, slug);

create table if not exists public.project_issue_types (
	project_id    uuid not null references public.projects(id) on delete cascade,
	issue_type_id uuid not null references public.issue_types(id) on delete cascade,
	created_at    timestamptz not null default now(),
	primary key (project_id, issue_type_id)
);
select app.register_table('project_issue_types', 'organisation', 'tickets', 'projects', 'project_id');

create or replace function public.work_seed_types(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_owner uuid;
begin
	select owner_user_id into v_owner from public.spaces where id = p_space;
	insert into public.issue_types (space_id, created_by, name, slug, level, legacy_kind, has_steps, icon, colour, sort_order)
	select p_space, v_owner, x.name, x.slug, x.level, x.legacy_kind, x.has_steps, x.icon, x.colour, x.ord
	from (values
		('Epic',     'epic',     1::smallint,  null,      false, 'zap',            '#a78bfa', 1),
		('Story',    'story',    0::smallint,  null,      false, 'bookmark',       '#34d399', 2),
		('Task',     'task',     0::smallint,  'task',    false, 'check-square',   '#7aa2f7', 3),
		('Bug',      'bug',      0::smallint,  null,      false, 'bug',            '#f87171', 4),
		('Sub-task', 'subtask',  -1::smallint, null,      false, 'corner-down-right', '#7dd3fc', 5),
		('Run-book', 'runbook',  0::smallint,  'runbook', true,  'list-checks',    '#fbbf24', 6),
		('Test',     'test',     0::smallint,  'test',    true,  'flask-conical',  '#f472b6', 7),
		('Guide',    'guide',    0::smallint,  'guide',   true,  'book-open',      '#2dd4bf', 8),
		('Setup',    'setup',    0::smallint,  'setup',   true,  'wrench',         '#fb923c', 9),
		('Audit',    'audit',    0::smallint,  'audit',   true,  'clipboard-check', '#94a3b8', 10)
	) as x(name, slug, level, legacy_kind, has_steps, icon, colour, ord)
	on conflict (space_id, slug) do nothing;
end
$$;
revoke all on function public.work_seed_types(uuid) from public;

select public.work_seed_types(id) from public.spaces;

-- New spaces: one trigger for everything Work seeds. Later migrations
-- replace this function to add their own seeds. It sorts after
-- spaces_seed_areas and spaces_seed_tickets, which it builds on.
create or replace function public.spaces_seed_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.work_seed_types(new.id);
	return new;
end
$$;
revoke all on function public.spaces_seed_work() from public;

drop trigger if exists spaces_seed_work on public.spaces;
create trigger spaces_seed_work
	after insert on public.spaces
	for each row execute function public.spaces_seed_work();

-- ---------------------------------------------------------------------
-- 3. tickets.type_id + tickets.epic_id, backfilled before the triggers exist
-- ---------------------------------------------------------------------
alter table public.tickets
	add column if not exists type_id uuid references public.issue_types(id) on delete set null,
	add column if not exists epic_id uuid references public.tickets(id) on delete set null;
create index if not exists tickets_type_idx on public.tickets (type_id);
create index if not exists tickets_epic_idx on public.tickets (epic_id) where epic_id is not null;

create or replace function public.work_type_slug_for(p_kind text, p_parent uuid)
returns text
language sql
immutable
set search_path = ''
as $$
	select case
		when p_kind in ('runbook', 'test', 'guide', 'audit', 'setup') then p_kind
		when p_parent is not null and coalesce(p_kind, 'task') = 'task' then 'subtask'
		else 'task'
	end
$$;

do $$
declare
	v_typed   bigint;
	v_habits  bigint;
	v_missing bigint;
begin
	update public.tickets t
	set type_id = it.id
	from public.issue_types it
	where it.space_id = t.space_id
	  and t.type_id is null
	  and coalesce(t.kind, 'task') <> 'habit'
	  and it.slug = public.work_type_slug_for(t.kind, t.parent_task_id);
	get diagnostics v_typed = row_count;

	select count(*) into v_habits from public.tickets where coalesce(kind, 'task') = 'habit';
	select count(*) into v_missing from public.tickets where coalesce(kind, 'task') <> 'habit' and type_id is null;
	raise notice '0141 issue types: % tickets typed, % habits left untyped, % without a type', v_typed, v_habits, v_missing;
	if v_missing > 0 then
		raise exception '0141: % non-habit tickets have no issue type', v_missing;
	end if;
end
$$;

-- ---------------------------------------------------------------------
-- 4. kind ↔ type
-- ---------------------------------------------------------------------
create or replace function public.tickets_sync_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_space  uuid;
	v_legacy text;
	v_chosen boolean;
begin
	-- habits are not Work items (W14)
	if coalesce(new.kind, 'task') = 'habit' then
		new.type_id := null;
		return new;
	end if;

	v_chosen := new.type_id is not null
		and (tg_op = 'INSERT' or new.type_id is distinct from old.type_id);

	if v_chosen then
		-- Work chose the type: kind follows it
		select space_id, legacy_kind into v_space, v_legacy from public.issue_types where id = new.type_id;
		if v_space is null then
			raise exception 'issue type % does not exist', new.type_id;
		end if;
		if v_space <> new.space_id then
			raise exception 'issue type % belongs to another space', new.type_id;
		end if;
		if coalesce(new.kind, 'task') <> 'reminder' then
			new.kind := coalesce(v_legacy, 'task');
		end if;
		return new;
	end if;

	-- an old path wrote kind or the parent (or nothing): type follows
	if new.type_id is null
	   or (tg_op = 'UPDATE' and (new.kind is distinct from old.kind
	                             or new.parent_task_id is distinct from old.parent_task_id)) then
		select id into new.type_id
		from public.issue_types
		where space_id = new.space_id
		  and slug = public.work_type_slug_for(new.kind, new.parent_task_id);
	end if;
	return new;
end
$$;
revoke all on function public.tickets_sync_type() from public;

drop trigger if exists tickets_01_sync_type on public.tickets;
create trigger tickets_01_sync_type
	before insert or update of type_id, kind, parent_task_id on public.tickets
	for each row execute function public.tickets_sync_type();

-- ---------------------------------------------------------------------
-- 5. Epic links
-- ---------------------------------------------------------------------
create or replace function public.tickets_check_epic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_project uuid;
	v_level   smallint;
	v_own     smallint;
	v_found   boolean;
	v_new     boolean;
begin
	if new.epic_id is null then
		return new;
	end if;
	v_new := tg_op = 'INSERT' or new.epic_id is distinct from old.epic_id;

	if new.epic_id = new.id then
		raise exception 'a ticket cannot be its own epic';
	end if;

	select true, t.project_id, it.level into v_found, v_project, v_level
	from public.tickets t
	left join public.issue_types it on it.id = t.type_id
	where t.id = new.epic_id;
	select level into v_own from public.issue_types where id = new.type_id;

	if v_found is not true or v_level is distinct from 1
	   or v_project is distinct from new.project_id
	   or v_own = 1 then
		if v_new then
			raise exception 'epic_id must point at an Epic in the same project, and an Epic cannot have one';
		end if;
		-- the ticket moved or changed type around an existing link: drop the link
		new.epic_id := null;
	end if;
	return new;
end
$$;
revoke all on function public.tickets_check_epic() from public;

drop trigger if exists tickets_02_check_epic on public.tickets;
create trigger tickets_02_check_epic
	before insert or update of epic_id, project_id, type_id on public.tickets
	for each row execute function public.tickets_check_epic();
