-- 0117_tickets_status_sync.sql
-- Tickets — Part B (status plumbing). From claude/tickets-spec.md §4.4 (d)
-- and §6.
--
-- Two status systems coexist during the transition: the legacy text column
-- `status` (0024 machine: new / in_progress / … / completed / cancelled) that
-- every existing Tasks surface reads, and the new `status_id` ->
-- ticket_statuses.category that the GTD lists, the Now view and automation
-- bind to. Part A backfilled status_id, but writers that predate it (capture
-- pipeline, agent tools) still insert without one, so those rows have no
-- category. This migration:
--
--   1. defaults status_id on insert to the space's default-workflow Inbox
--      status (GTD: everything captured is unclarified until moved);
--   2. keeps the two systems in sync on every write, in both directions:
--      a change to status_id derives the legacy status + completed_at /
--      cancelled_at; a change to the legacy status alone derives status_id;
--   3. backfills the rows Part A missed (status_id null) into Inbox, and
--      re-derives status_id from the legacy status for the rows Part A put in
--      Backlog while their legacy status said otherwise (e.g. in_progress).
--
-- Category -> legacy status:
--   inbox | backlog | next -> new       doing -> in_progress
--   waiting -> waiting_third_party      verify -> review
--   done -> completed                   cancelled -> cancelled
-- Legacy status -> category (used only when status_id did not change):
--   completed -> done                   cancelled -> cancelled
--   in_progress -> doing                blocked | on_hold | waiting_third_party -> waiting
--   review | pending_review | testing -> verify
--   new -> the current category if it is inbox/backlog/next, else backlog
--
-- Depends on: 0116.

-- ---------------------------------------------------------------------
-- 1. Helpers: find a status by category in a space's default workflow
-- ---------------------------------------------------------------------
create or replace function public.ticket_status_for(p_space uuid, p_category text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select st.id
	from public.ticket_statuses st
	join public.ticket_workflows wf on wf.id = st.workflow_id and wf.is_default
	where st.space_id = p_space and st.category = p_category
	order by st.sort_order
	limit 1
$$;
revoke all on function public.ticket_status_for(uuid, text) from public;
grant execute on function public.ticket_status_for(uuid, text) to authenticated;

create or replace function public.ticket_category_of(p_status uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select category from public.ticket_statuses where id = p_status
$$;
revoke all on function public.ticket_category_of(uuid) from public;
grant execute on function public.ticket_category_of(uuid) to authenticated;

create or replace function public.ticket_legacy_to_category(p_status text, p_current text)
returns text
language sql
immutable
set search_path = ''
as $$
	select case p_status
		when 'completed'           then 'done'
		when 'cancelled'           then 'cancelled'
		when 'in_progress'         then 'doing'
		when 'blocked'             then 'waiting'
		when 'on_hold'             then 'waiting'
		when 'waiting_third_party' then 'waiting'
		when 'review'              then 'verify'
		when 'pending_review'      then 'verify'
		when 'testing'             then 'verify'
		else case when p_current in ('inbox', 'backlog', 'next') then p_current else 'backlog' end
	end
$$;
revoke all on function public.ticket_legacy_to_category(text, text) from public;
grant execute on function public.ticket_legacy_to_category(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. The sync trigger
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
begin
	-- (a) default the category on insert
	if tg_op = 'INSERT' and new.status_id is null then
		-- honour a legacy status the writer did set (e.g. the Tasks POST)
		if new.status is not null and new.status <> 'new' then
			new.status_id := public.ticket_status_for(new.space_id, public.ticket_legacy_to_category(new.status, null));
		end if;
		if new.status_id is null then
			new.status_id := public.ticket_status_for(new.space_id, 'inbox');
		end if;
	end if;

	v_cat := public.ticket_category_of(new.status_id);

	if tg_op = 'UPDATE' then
		v_old_cat := public.ticket_category_of(old.status_id);
		-- (b) legacy status changed on its own -> derive the category
		if new.status_id is not distinct from old.status_id
		   and new.status is distinct from old.status then
			new.status_id := coalesce(
				public.ticket_status_for(new.space_id, public.ticket_legacy_to_category(new.status, v_cat)),
				new.status_id);
			v_cat := public.ticket_category_of(new.status_id);
		end if;
	end if;

	if v_cat is null then
		return new;
	end if;

	-- (c) category -> legacy status + timestamps
	v_legacy := case v_cat
		when 'doing'     then 'in_progress'
		when 'waiting'   then 'waiting_third_party'
		when 'verify'    then 'review'
		when 'done'      then 'completed'
		when 'cancelled' then 'cancelled'
		else 'new'
	end;

	-- Only rewrite the legacy status when the category moved (or on insert),
	-- so a finer legacy value (blocked vs on_hold) survives an unrelated edit.
	if tg_op = 'INSERT' or v_cat is distinct from v_old_cat
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

	return new;
end
$$;
revoke all on function public.tickets_sync_status() from public;

drop trigger if exists tickets_sync_status on public.tickets;
create trigger tickets_sync_status
	before insert or update of status_id, status on public.tickets
	for each row execute function public.tickets_sync_status();

-- ---------------------------------------------------------------------
-- 3. Every space needs a default workflow. 0116 seeded the spaces that
--    existed then; spaces created since (new users, teams) have none, so
--    seed on insert and backfill the stragglers. Idempotent.
-- ---------------------------------------------------------------------
create or replace function public.tickets_seed_workflow(p_space uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_wf    uuid;
	v_owner uuid;
begin
	select owner_user_id into v_owner from public.spaces where id = p_space;
	select id into v_wf from public.ticket_workflows where space_id = p_space and is_default limit 1;
	if v_wf is null then
		insert into public.ticket_workflows (space_id, created_by, name, is_default)
		values (p_space, v_owner, 'Default', true)
		returning id into v_wf;
	end if;
	insert into public.ticket_statuses (space_id, created_by, workflow_id, name, category, sort_order)
	select p_space, v_owner, v_wf, x.name, x.category, x.ord
	from (values
		('Inbox', 'inbox', 0), ('Backlog', 'backlog', 1), ('Next', 'next', 2),
		('Doing', 'doing', 3), ('Waiting', 'waiting', 4), ('Verify', 'verify', 5),
		('Done', 'done', 6), ('Cancelled', 'cancelled', 7)
	) as x(name, category, ord)
	on conflict (workflow_id, name) do nothing;
	return v_wf;
end
$$;
revoke all on function public.tickets_seed_workflow(uuid) from public;

create or replace function public.spaces_seed_tickets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.tickets_seed_workflow(new.id);
	return new;
end
$$;
revoke all on function public.spaces_seed_tickets() from public;

drop trigger if exists spaces_seed_tickets on public.spaces;
create trigger spaces_seed_tickets
	after insert on public.spaces
	for each row execute function public.spaces_seed_tickets();

select public.tickets_seed_workflow(s.id)
from public.spaces s
where not exists (select 1 from public.ticket_workflows w where w.space_id = s.id and w.is_default);

-- ---------------------------------------------------------------------
-- 4. Backfill: rows without a category -> Inbox; rows whose legacy status
--    disagrees with the Part A backlog/done guess -> the legacy-derived
--    category. The trigger then re-derives the legacy side consistently.
-- ---------------------------------------------------------------------
update public.tickets t
set status_id = public.ticket_status_for(t.space_id, 'inbox')
where t.status_id is null;

update public.tickets t
set status_id = public.ticket_status_for(t.space_id, public.ticket_legacy_to_category(t.status, public.ticket_category_of(t.status_id)))
where public.ticket_legacy_to_category(t.status, public.ticket_category_of(t.status_id))
      is distinct from public.ticket_category_of(t.status_id);
