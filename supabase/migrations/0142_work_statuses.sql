-- 0142_work_statuses.sql
-- Work redesign (MYC-174, claude/spec-work.md §2.1) — three status
-- categories and workflows per space, per project and per issue type (W4).
--
--   • ticket_statuses.status_category  todo | in_progress | done — what
--     boards, automation, reports and /api/work bind to
--   • ticket_statuses.resolution       on done-category statuses; Cancelled
--     stays a status, with resolution = cancelled
--   • ticket_statuses.category         the eight GTD values STAY as a
--     compatibility column: tix and both webhooks address statuses by them
--     (W16). Each column is derived from the other by trigger, so an old
--     path and a Work path can both write a status.
--   • tickets.resolution / resolved_at maintained by the sync trigger
--   • ticket_workflow_map              which workflow a ticket uses:
--     project + type → project → space + type → the space default
--   • tickets_sync_status              now also RE-HOMES a status into the
--     ticket's own workflow, so whatever status an old path resolves in the
--     default workflow lands on its counterpart
-- No ticket changes status in this migration.
-- Depends on: 0141.

-- ---------------------------------------------------------------------
-- 1. Status categories + resolution
-- ---------------------------------------------------------------------
alter table public.ticket_statuses
	add column if not exists status_category text,
	add column if not exists resolution text;

create or replace function public.work_status_category_of(p_category text)
returns text
language sql
immutable
set search_path = ''
as $$
	select case
		when p_category in ('inbox', 'backlog', 'next') then 'todo'
		when p_category in ('doing', 'waiting', 'verify') then 'in_progress'
		when p_category in ('done', 'cancelled') then 'done'
	end
$$;

/** The legacy category a Work-made status carries, from its name. */
create or replace function public.work_legacy_category_of(p_status_category text, p_name text, p_resolution text)
returns text
language sql
immutable
set search_path = ''
as $$
	select case p_status_category
		when 'todo' then case
			when p_name ~* 'inbox' then 'inbox'
			when p_name ~* '(backlog|hold|someday|later|icebox)' then 'backlog'
			else 'next'
		end
		when 'in_progress' then case
			when p_name ~* '(review|test|verif|qa)' then 'verify'
			when p_name ~* '(wait|block)' then 'waiting'
			else 'doing'
		end
		when 'done' then case
			when p_resolution in ('cancelled', 'duplicate', 'wont_do') or p_name ~* '(cancel|won.?t|duplicate|reject)' then 'cancelled'
			else 'done'
		end
	end
$$;

update public.ticket_statuses
set status_category = public.work_status_category_of(category)
where status_category is null;

update public.ticket_statuses
set resolution = case when category = 'cancelled' then 'cancelled' else 'done' end
where status_category = 'done' and resolution is null;

alter table public.ticket_statuses
	alter column status_category set not null;
alter table public.ticket_statuses
	drop constraint if exists ticket_statuses_status_category_check,
	add constraint ticket_statuses_status_category_check check (status_category in ('todo', 'in_progress', 'done')),
	drop constraint if exists ticket_statuses_resolution_check,
	add constraint ticket_statuses_resolution_check check (
		(status_category = 'done' and resolution in ('done', 'cancelled', 'duplicate', 'wont_do'))
		or (status_category <> 'done' and resolution is null)
	);
create index if not exists ticket_statuses_workflow_category_idx
	on public.ticket_statuses (workflow_id, status_category, sort_order);

create or replace function public.ticket_statuses_sync_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.status_category is null and new.category is null then
			raise exception 'a status needs a status_category';
		end if;
		if new.status_category is null then
			new.status_category := public.work_status_category_of(new.category);
		elsif new.category is null then
			new.category := public.work_legacy_category_of(new.status_category, new.name, new.resolution);
		end if;
	else
		if new.status_category is distinct from old.status_category
		   and new.category is not distinct from old.category then
			-- Work moved the status to another category
			new.category := public.work_legacy_category_of(new.status_category, new.name, new.resolution);
		elsif new.category is distinct from old.category
		   and new.status_category is not distinct from old.status_category then
			new.status_category := public.work_status_category_of(new.category);
		end if;
	end if;

	if new.status_category <> 'done' then
		new.resolution := null;
	elsif new.resolution is null then
		new.resolution := case when new.category = 'cancelled' then 'cancelled' else 'done' end;
	end if;
	-- the two columns never disagree about which side of done a status is on
	if public.work_status_category_of(new.category) is distinct from new.status_category then
		new.category := public.work_legacy_category_of(new.status_category, new.name, new.resolution);
	end if;
	return new;
end
$$;

drop trigger if exists ticket_statuses_sync_category on public.ticket_statuses;
create trigger ticket_statuses_sync_category
	before insert or update of category, status_category, resolution, name on public.ticket_statuses
	for each row execute function public.ticket_statuses_sync_category();

alter table public.ticket_workflows
	add column if not exists description text,
	add column if not exists archived_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Which workflow applies
-- ---------------------------------------------------------------------
create table if not exists public.ticket_workflow_map (
	id            uuid primary key default gen_random_uuid(),
	project_id    uuid references public.projects(id) on delete cascade,
	issue_type_id uuid references public.issue_types(id) on delete cascade,
	workflow_id   uuid not null references public.ticket_workflows(id) on delete cascade,
	created_at    timestamptz not null default now(),
	check (project_id is not null or issue_type_id is not null)
);
select app.register_table('ticket_workflow_map', 'organisation', 'tickets', 'ticket_workflows', 'workflow_id');
create unique index if not exists ticket_workflow_map_scope on public.ticket_workflow_map (
	space_id,
	coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
	coalesce(issue_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- a project-level workflow recorded on the (until now unused) column
insert into public.ticket_workflow_map (space_id, created_by, project_id, workflow_id)
select p.space_id, p.created_by, p.id, p.workflow_id
from public.projects p
join public.ticket_workflows w on w.id = p.workflow_id
where p.workflow_id is not null
on conflict do nothing;

create or replace function public.ticket_workflow_for(p_space uuid, p_project uuid, p_type uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select m.workflow_id from public.ticket_workflow_map m
			join public.ticket_workflows w on w.id = m.workflow_id and w.archived_at is null
			where m.space_id = p_space and m.project_id = p_project and m.issue_type_id = p_type limit 1),
		(select m.workflow_id from public.ticket_workflow_map m
			join public.ticket_workflows w on w.id = m.workflow_id and w.archived_at is null
			where m.space_id = p_space and m.project_id = p_project and m.issue_type_id is null limit 1),
		(select m.workflow_id from public.ticket_workflow_map m
			join public.ticket_workflows w on w.id = m.workflow_id and w.archived_at is null
			where m.space_id = p_space and m.project_id is null and m.issue_type_id = p_type limit 1),
		(select w.id from public.ticket_workflows w where w.space_id = p_space and w.is_default limit 1)
	)
$$;
revoke all on function public.ticket_workflow_for(uuid, uuid, uuid) from public;
grant execute on function public.ticket_workflow_for(uuid, uuid, uuid) to authenticated, service_role;

/** A workflow's status for a status category; a legacy category narrows it. */
create or replace function public.ticket_status_in(p_workflow uuid, p_status_category text, p_legacy text default null)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select st.id
	from public.ticket_statuses st
	where st.workflow_id = p_workflow and st.status_category = p_status_category
	order by (st.category = p_legacy) desc nulls last, st.is_category_default desc, st.sort_order
	limit 1
$$;
revoke all on function public.ticket_status_in(uuid, text, text) from public;
grant execute on function public.ticket_status_in(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. tickets.resolution / resolved_at
-- ---------------------------------------------------------------------
alter table public.tickets
	add column if not exists resolution text check (resolution in ('done', 'cancelled', 'duplicate', 'wont_do')),
	add column if not exists resolved_at timestamptz;
create index if not exists tickets_resolved_at_idx on public.tickets (space_id, resolved_at) where resolved_at is not null;

do $$
declare
	n bigint;
begin
	update public.tickets t
	set resolution = st.resolution,
	    resolved_at = coalesce(t.completed_at, t.cancelled_at, t.updated_at)
	from public.ticket_statuses st
	where st.id = t.status_id and st.status_category = 'done' and t.resolved_at is null;
	get diagnostics n = row_count;
	raise notice '0142 resolution: % tickets already in a Done-category status stamped', n;
end
$$;

-- ---------------------------------------------------------------------
-- 4. The sync trigger (0139 body) + workflow re-home + resolution
-- ---------------------------------------------------------------------
create or replace function public.tickets_sync_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_cat      text;
	v_old_cat  text;
	v_legacy   text;
	v_name     text;
	v_scat     text;
	v_res      text;
	v_wf       uuid;
	v_st_wf    uuid;
	v_home     uuid;
	v_touch    boolean;
begin
	-- (a) default the category on insert
	if tg_op = 'INSERT' and new.status_id is null then
		if new.status is not null and new.status <> 'new' then
			new.status_id := public.ticket_status_for_legacy(new.space_id, new.status, null);
		end if;
		if new.status_id is null then
			new.status_id := public.ticket_status_for(new.space_id, 'inbox');
		end if;
	end if;

	v_cat := public.ticket_category_of(new.status_id);

	if tg_op = 'UPDATE' then
		v_old_cat := public.ticket_category_of(old.status_id);
		-- (b) legacy status changed on its own -> derive the status
		if new.status_id is not distinct from old.status_id
		   and new.status is distinct from old.status then
			new.status_id := coalesce(
				public.ticket_status_for_legacy(new.space_id, new.status, v_cat),
				new.status_id);
			v_cat := public.ticket_category_of(new.status_id);
		end if;
	end if;

	if v_cat is null then
		return new;
	end if;

	-- (b2) 0142: a ticket's status lives in the ticket's own workflow. The
	-- old paths resolve statuses in the space default; a type or project
	-- change can also change the workflow. Same name first, else the
	-- counterpart by category.
	select name, status_category, workflow_id into v_name, v_scat, v_st_wf
	from public.ticket_statuses where id = new.status_id;
	v_wf := public.ticket_workflow_for(new.space_id, new.project_id, new.type_id);
	if v_wf is not null and v_st_wf is distinct from v_wf then
		select id into v_home from public.ticket_statuses
		where workflow_id = v_wf and lower(name) = lower(v_name)
		limit 1;
		if v_home is null then
			v_home := public.ticket_status_in(v_wf, v_scat, v_cat);
		end if;
		if v_home is not null then
			new.status_id := v_home;
			v_cat := public.ticket_category_of(new.status_id);
		end if;
	end if;

	-- The trigger now also fires on type / project / kind changes. Unless
	-- the status itself moved, nothing below may touch a timestamp: a
	-- start or finish date is never invented by an unrelated edit.
	v_touch := tg_op = 'INSERT'
		or new.status_id is distinct from old.status_id
		or new.status is distinct from old.status;

	select name, status_category, resolution into v_name, v_scat, v_res
	from public.ticket_statuses where id = new.status_id;

	if v_touch then
		-- (c) status -> legacy status + timestamps
		v_legacy := case
			when v_name = 'On Hold' then 'on_hold'
			when v_name = 'Testing' then 'testing'
			else case v_cat
				when 'doing'     then 'in_progress'
				when 'waiting'   then 'waiting_third_party'
				when 'verify'    then 'review'
				when 'done'      then 'completed'
				when 'cancelled' then 'cancelled'
				else 'new'
			end
		end;

		if tg_op = 'INSERT' or new.status_id is distinct from old.status_id
		   or public.ticket_legacy_to_category(new.status, v_cat) is distinct from v_cat then
			new.status := v_legacy;
		end if;

		if v_cat = 'done' then
			new.completed_at := coalesce(new.completed_at, now());
			new.cancelled_at := null;
		elsif v_cat = 'cancelled' then
			new.cancelled_at := coalesce(new.cancelled_at, now());
			new.completed_at := null;
		else
			new.completed_at := null;
			new.cancelled_at := null;
		end if;

		-- (d) 0139: Started = the first entry into doing, kept for ever
		if v_cat = 'doing' and new.started_at is null then
			new.started_at := now();
		end if;
	end if;

	-- (e) 0142: resolution. A caller may name one; otherwise the status's.
	if v_touch or (tg_op = 'UPDATE' and new.resolution is distinct from old.resolution) then
		if v_scat = 'done' then
			if tg_op = 'UPDATE' and new.resolution is not null and new.resolution is distinct from old.resolution then
				null;
			elsif tg_op = 'INSERT' and new.resolution is not null then
				null;
			else
				new.resolution := coalesce(v_res, 'done');
			end if;
			new.resolved_at := coalesce(new.resolved_at, now());
		else
			new.resolution := null;
			new.resolved_at := null;
		end if;
	end if;

	return new;
end
$$;
revoke all on function public.tickets_sync_status() from public;

drop trigger if exists tickets_sync_status on public.tickets;
create trigger tickets_sync_status
	before insert or update of status_id, status, type_id, project_id, kind, parent_task_id, resolution on public.tickets
	for each row execute function public.tickets_sync_status();
