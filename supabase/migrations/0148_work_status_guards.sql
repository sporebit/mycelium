-- 0148_work_status_guards.sql
-- Work redesign (MYC-174, claude/spec-work.md §2.1) — three gaps the
-- workflow editor opened, closed in the database so no caller can miss them.
--
--   1. A new ticket always gets a status. The old insert path asks the
--      space default workflow for its `inbox` status; a workflow edited in
--      Work may no longer have one. It now falls back to the first To Do
--      status of the ticket's own workflow.
--   2. Re-categorising a status re-syncs its tickets: resolution,
--      resolved / completed / cancelled stamps and the legacy status text
--      follow the status's new category. A start date is never invented.
--   3. work_rehome(space): after the workflow map or the space default
--      changes, tickets move to their counterpart status at once instead
--      of at their next edit. SECURITY INVOKER — the caller's RLS applies.
--   4. Docs: a doc space cannot be deleted while it holds a live page —
--      checked with definer rights, because the caller's RLS hides
--      restricted pages and the cascade would take them too. And an
--      unshared page template is its creator's alone, as an unshared saved
--      filter is.
-- No tables. Depends on: 0147.

-- ---------------------------------------------------------------------
-- 1. The insert default
-- ---------------------------------------------------------------------
create or replace function public.ticket_default_status(p_space uuid, p_project uuid, p_type uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		public.ticket_status_in(public.ticket_workflow_for(p_space, p_project, p_type), 'todo', 'inbox'),
		public.ticket_status_for(p_space, 'inbox'),
		(select st.id
			from public.ticket_statuses st
			join public.ticket_workflows wf on wf.id = st.workflow_id and wf.is_default
			where st.space_id = p_space
			order by case st.status_category when 'todo' then 0 when 'in_progress' then 1 else 2 end, st.sort_order
			limit 1)
	)
$$;
revoke all on function public.ticket_default_status(uuid, uuid, uuid) from public;
grant execute on function public.ticket_default_status(uuid, uuid, uuid) to authenticated, service_role;

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
	-- (a) default the status on insert
	if tg_op = 'INSERT' and new.status_id is null then
		if new.status is not null and new.status <> 'new' then
			new.status_id := public.ticket_status_for_legacy(new.space_id, new.status, null);
		end if;
		if new.status_id is null then
			-- 0148: the ticket's own workflow first, so a workflow without an
			-- Inbox still gives every new ticket a status
			new.status_id := public.ticket_default_status(new.space_id, new.project_id, new.type_id);
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

	-- (b2) 0142: a ticket's status lives in the ticket's own workflow
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
		if v_cat = 'doing' and new.started_at is null
		   and (tg_op = 'INSERT' or new.status_id is distinct from old.status_id or v_old_cat is distinct from 'doing') then
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

-- ---------------------------------------------------------------------
-- 2. A status that changes category takes its tickets with it
-- ---------------------------------------------------------------------
create or replace function public.ticket_statuses_resync_tickets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_legacy text;
begin
	if new.status_category is not distinct from old.status_category
	   and new.category is not distinct from old.category
	   and new.resolution is not distinct from old.resolution then
		return null;
	end if;
	v_legacy := case
		when new.name = 'On Hold' then 'on_hold'
		when new.name = 'Testing' then 'testing'
		else case new.category
			when 'doing'     then 'in_progress'
			when 'waiting'   then 'waiting_third_party'
			when 'verify'    then 'review'
			when 'done'      then 'completed'
			when 'cancelled' then 'cancelled'
			else 'new'
		end
	end;
	-- Written in full: the ticket's status_id does not change here, so the
	-- ticket trigger would not act on its own. Where it does fire (the
	-- legacy text changed) it computes these same values from the status
	-- row, and its (d) leaves started_at alone because the status did not move.
	update public.tickets t
	set status = v_legacy,
	    completed_at = case when new.category = 'done' then coalesce(t.completed_at, now()) else null end,
	    cancelled_at = case when new.category = 'cancelled' then coalesce(t.cancelled_at, now()) else null end,
	    resolution = case when new.status_category = 'done' then coalesce(new.resolution, 'done') else null end,
	    resolved_at = case when new.status_category = 'done' then coalesce(t.resolved_at, now()) else null end
	where t.status_id = new.id;
	return null;
end
$$;
revoke all on function public.ticket_statuses_resync_tickets() from public;

drop trigger if exists ticket_statuses_resync_tickets on public.ticket_statuses;
create trigger ticket_statuses_resync_tickets
	after update of status_category, category, resolution on public.ticket_statuses
	for each row execute function public.ticket_statuses_resync_tickets();

-- ---------------------------------------------------------------------
-- 3. Re-home now
-- ---------------------------------------------------------------------
create or replace function public.work_rehome(p_space uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
	n int;
begin
	-- naming status_id fires tickets_sync_status, whose (b2) does the move
	update public.tickets t
	set status_id = t.status_id
	from public.ticket_statuses st
	where st.id = t.status_id
	  and t.space_id = p_space
	  and coalesce(t.kind, 'task') <> 'habit'
	  and st.workflow_id is distinct from public.ticket_workflow_for(t.space_id, t.project_id, t.type_id);
	get diagnostics n = row_count;
	return n;
end
$$;
revoke all on function public.work_rehome(uuid) from public;
grant execute on function public.work_rehome(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Docs guards
-- ---------------------------------------------------------------------
create or replace function public.doc_spaces_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	n bigint;
begin
	-- The guard is for people: a request through the API carries a user.
	-- System work (a cascade from deleting the P12 space, a clean-up run as
	-- the database owner) has none and is let through.
	if auth.uid() is null
	   or not exists (select 1 from public.spaces where id = old.space_id) then
		return old;
	end if;
	select count(*) into n from public.doc_pages where doc_space_id = old.id and archived_at is null;
	if n > 0 then
		raise exception 'this doc space still holds % live page(s); archive or move them first', n
			using errcode = '23503';
	end if;
	return old;
end
$$;
revoke all on function public.doc_spaces_guard_delete() from public;

drop trigger if exists doc_spaces_guard_delete on public.doc_spaces;
create trigger doc_spaces_guard_delete
	before delete on public.doc_spaces
	for each row execute function public.doc_spaces_guard_delete();

drop policy if exists doc_templates_private on public.doc_templates;
create policy doc_templates_private on public.doc_templates
	as restrictive for all to authenticated
	using (shared or created_by = auth.uid())
	with check (shared or created_by = auth.uid());
