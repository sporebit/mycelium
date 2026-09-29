-- 0143_work_projects.sql
-- Work redesign (MYC-174, claude/spec-work.md §2.3, §8.3–8.5) — projects
-- inside Work, components, the per-space default project (W2, W6, W11).
--
--   • projects: is_default, lead, key dates, links, board config
--   • components / ticket_components
--   • General — one default project per space, WITHOUT a prefix, so its
--     tickets keep taking the space's keys (PW-n) from the space counter
--   • tickets_00_default_project — a non-habit ticket with no project
--     lands in the default project; capture needs no change (W11)
--   • data moves, each with its inverse recorded in the spec:
--       sub-projects → a component on the parent (tickets + sprints follow)
--       unprojected non-habit tickets → the default project
--       someday tickets still in To Do → the Backlog status
--     Ticket triggers are off for the moves, and the migration fails if
--     any ticket_key differs afterwards.
-- Areas become "project categories" in every label; the table keeps its
-- name. Habits are not touched (W14).
-- Depends on: 0142.

-- ---------------------------------------------------------------------
-- 1. Projects
-- ---------------------------------------------------------------------
alter table public.projects
	add column if not exists is_default    boolean not null default false,
	add column if not exists lead_user_id  uuid references auth.users(id) on delete set null,
	add column if not exists start_on      date,
	add column if not exists target_on     date,
	add column if not exists links         jsonb not null default '[]'::jsonb,
	add column if not exists board_type    text not null default 'kanban',
	add column if not exists board_columns jsonb;
alter table public.projects
	drop constraint if exists projects_board_type_check,
	add constraint projects_board_type_check check (board_type in ('kanban', 'scrum')),
	drop constraint if exists projects_links_shape,
	add constraint projects_links_shape check (jsonb_typeof(links) = 'array');
create unique index if not exists projects_one_default_per_space
	on public.projects (space_id) where is_default;

-- a project key may not shadow the space's own prefix (the default
-- project answers to it), and sub-projects are gone (W6)
create or replace function public.projects_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_space_prefix text;
begin
	if new.parent_id is not null
	   and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
		raise exception 'sub-projects were replaced by components (0143)';
	end if;
	if new.prefix is not null
	   and (tg_op = 'INSERT' or new.prefix is distinct from old.prefix) then
		select ticket_prefix into v_space_prefix from public.spaces where id = new.space_id;
		if v_space_prefix is not null and upper(new.prefix) = upper(v_space_prefix) then
			raise exception 'the key % belongs to the space''s default project', new.prefix;
		end if;
	end if;
	return new;
end
$$;
revoke all on function public.projects_guard() from public;

-- ---------------------------------------------------------------------
-- 2. Components
-- ---------------------------------------------------------------------
create table if not exists public.components (
	id                       uuid primary key default gen_random_uuid(),
	project_id               uuid not null references public.projects(id) on delete cascade,
	name                     text not null check (length(btrim(name)) > 0),
	description              text,
	lead_user_id             uuid references auth.users(id) on delete set null,
	sort_order               int not null default 0,
	archived_at              timestamptz,
	migrated_from_project_id uuid references public.projects(id) on delete set null,
	created_at               timestamptz not null default now(),
	updated_at               timestamptz not null default now()
);
select app.register_table('components', 'organisation', 'tickets', 'projects', 'project_id');
create unique index if not exists components_name_per_project on public.components (project_id, lower(name));

create table if not exists public.ticket_components (
	ticket_id    uuid not null references public.tickets(id) on delete cascade,
	component_id uuid not null references public.components(id) on delete cascade,
	created_at   timestamptz not null default now(),
	primary key (ticket_id, component_id)
);
select app.register_table('ticket_components', 'organisation', 'tickets', 'tickets', 'ticket_id');
create index if not exists ticket_components_component_idx on public.ticket_components (component_id);

-- ---------------------------------------------------------------------
-- 3. The default project
-- ---------------------------------------------------------------------
create or replace function public.work_seed_default_project(p_space uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id    uuid;
	v_owner uuid;
	v_area  uuid;
begin
	select id into v_id from public.projects where space_id = p_space and is_default limit 1;
	if v_id is not null then
		return v_id;
	end if;
	select owner_user_id into v_owner from public.spaces where id = p_space;
	select id into v_area from public.areas
	where space_id = p_space and kind = 'life' and archived_at is null
	order by sort_order limit 1;
	insert into public.projects (space_id, created_by, name, description, status, colour, area_id, prefix, is_default, sort_order)
	values (p_space, v_owner, 'General', 'Everything that does not belong to a project of its own. Captures land here, in Inbox.', 'active', '#9ece6a', v_area, null, true, -1)
	returning id into v_id;
	return v_id;
end
$$;
revoke all on function public.work_seed_default_project(uuid) from public;

select public.work_seed_default_project(id) from public.spaces;

create or replace function public.spaces_seed_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.work_seed_types(new.id);
	perform public.work_seed_default_project(new.id);
	return new;
end
$$;
revoke all on function public.spaces_seed_work() from public;

create or replace function public.tickets_default_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.project_id is null and coalesce(new.kind, 'task') <> 'habit' then
		select id into new.project_id
		from public.projects
		where space_id = new.space_id and is_default
		limit 1;
	end if;
	return new;
end
$$;
revoke all on function public.tickets_default_project() from public;

-- ---------------------------------------------------------------------
-- 4. The data moves
-- ---------------------------------------------------------------------
-- The snapshot, the trigger switch and the moves share one block, so they
-- stand or fall together however the file is sent to the server.
do $$
declare
	sp           record;
	v_comp       uuid;
	v_subs       bigint := 0;
	v_sub_moved  bigint := 0;
	v_moved      bigint := 0;
	v_someday    bigint := 0;
	v_changed    bigint;
	n            bigint;
begin
	create temporary table work_0143_keys on commit drop as
		select id, ticket_key, seq from public.tickets;
	alter table public.tickets disable trigger user;

	-- 4.1 sub-projects → components (§8.3)
	for sp in
		select p.id, p.parent_id, p.name, p.description, p.space_id, p.created_by
		from public.projects p
		where p.parent_id is not null
		order by p.created_at
	loop
		v_comp := null;
		select id into v_comp from public.components
		where project_id = sp.parent_id and lower(name) = lower(sp.name);
		if v_comp is null then
			insert into public.components (space_id, created_by, project_id, name, description, migrated_from_project_id)
			values (sp.space_id, sp.created_by, sp.parent_id, sp.name, sp.description, sp.id)
			returning id into v_comp;
		else
			update public.components set migrated_from_project_id = sp.id
			where id = v_comp and migrated_from_project_id is null;
		end if;

		insert into public.ticket_components (space_id, created_by, ticket_id, component_id)
		select t.space_id, t.created_by, t.id, v_comp
		from public.tickets t
		where t.project_id = sp.id
		on conflict do nothing;

		update public.tickets set project_id = sp.parent_id where project_id = sp.id;
		get diagnostics n = row_count;
		v_sub_moved := v_sub_moved + n;

		-- one active sprint per project: the sub-project's gives way
		update public.sprints s set status = 'planned'
		where s.project_id = sp.id and s.status = 'active'
		  and exists (select 1 from public.sprints p where p.project_id = sp.parent_id and p.status = 'active');
		update public.sprints set project_id = sp.parent_id where project_id = sp.id;

		update public.ticket_workflow_map set project_id = sp.parent_id
		where project_id = sp.id
		  and not exists (
			select 1 from public.ticket_workflow_map m
			where m.project_id = sp.parent_id
			  and m.issue_type_id is not distinct from public.ticket_workflow_map.issue_type_id
		  );

		update public.projects set status = 'archived', updated_at = now() where id = sp.id;
		v_subs := v_subs + 1;
	end loop;

	-- 4.2 unprojected non-habit tickets → the default project (§8.4)
	update public.tickets t
	set project_id = p.id
	from public.projects p
	where p.space_id = t.space_id and p.is_default
	  and t.project_id is null
	  and coalesce(t.kind, 'task') <> 'habit';
	get diagnostics v_moved = row_count;

	-- 4.3 open someday tickets → Backlog (§8.5); someday itself is kept
	with target as (
		select t.id, t.space_id, cur.category as from_category,
		       public.ticket_status_in(
				public.ticket_workflow_for(t.space_id, t.project_id, t.type_id), 'todo', 'backlog') as backlog_id
		from public.tickets t
		join public.ticket_statuses cur on cur.id = t.status_id
		where t.someday
		  and t.deleted_at is null
		  and coalesce(t.kind, 'task') <> 'habit'
		  -- only work not yet started: a someday flag never pulls a ticket
		  -- back out of In Progress or In Review
		  and cur.status_category = 'todo'
		  and cur.category <> 'backlog'
	), moved as (
		update public.tickets t
		set status_id = g.backlog_id,
		    status = 'new'
		from target g
		join public.ticket_statuses b on b.id = g.backlog_id and b.category = 'backlog'
		where t.id = g.id
		returning t.id, t.space_id, g.from_category
	)
	insert into public.ticket_activity (space_id, ticket_id, action, field, from_value, to_value)
	select m.space_id, m.id, 'update', 'status_id', m.from_category, 'backlog'
	from moved m;
	get diagnostics v_someday = row_count;

	-- the invariant: no key moved
	select count(*) into v_changed
	from public.tickets t
	join work_0143_keys k on k.id = t.id
	where t.ticket_key is distinct from k.ticket_key or t.seq is distinct from k.seq;

	raise notice '0143: % sub-projects became components (% tickets followed); % unprojected tickets moved to the default project; % someday tickets moved to Backlog; % keys changed',
		v_subs, v_sub_moved, v_moved, v_someday, v_changed;
	if v_changed > 0 then
		raise exception '0143: % ticket keys changed — aborting', v_changed;
	end if;
	select count(*) into n from public.tickets where project_id is null and coalesce(kind, 'task') <> 'habit';
	if n > 0 then
		raise exception '0143: % non-habit tickets still have no project', n;
	end if;

	alter table public.tickets enable trigger user;
end
$$;

-- ---------------------------------------------------------------------
-- 5. Triggers, after the moves
-- ---------------------------------------------------------------------
drop trigger if exists projects_guard on public.projects;
create trigger projects_guard
	before insert or update of parent_id, prefix on public.projects
	for each row execute function public.projects_guard();

drop trigger if exists tickets_00_default_project on public.tickets;
create trigger tickets_00_default_project
	before insert on public.tickets
	for each row execute function public.tickets_default_project();
