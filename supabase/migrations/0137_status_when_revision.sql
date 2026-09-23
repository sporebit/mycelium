-- 0137_status_when_revision.sql
-- Tickets spec §18 (Phil, Cowork 2026-09-23): one 12-status workflow for
-- every space, Done vs Closed, and "When" instead of urgency labels.
--
--   * Statuses renamed in place (ids kept, every ticket keeps its status):
--     Next → Selected for Development, Doing → In Progress, Verify → In
--     Review, Waiting → Waiting on 3rd Party; four inserted: Testing
--     (verify), Waiting on my Decision (next), On Hold (backlog), Closed
--     (done). Display order per R1.
--   * ticket_statuses.is_category_default: ticket_status_for() used to pick
--     the lowest sort_order in a category, which with the new order would
--     resolve `backlog` to On Hold before Backlog. One default per workflow
--     + category (partial unique index); the function resolves by it.
--   * The 0117 sync trigger maps a legacy `status` to a *specific* status
--     where one exists (on_hold → On Hold, testing → Testing) and writes
--     on_hold / testing back, so the finer values survive.
--   * Done + verified_by → Closed (R2: Closed = Phil verified it live).
--   * tickets.due_window: the When choice. Legacy urgency labels re-dated
--     from created_at (R7: today → created date, this_week → +7,
--     this_month → +30, someday → someday = true). urgent reset to false (R8).
--   * RLS unchanged (no new tables). Depends on: 0117, 0135.

-- ---------------------------------------------------------------------
-- 1. Category default flag
-- ---------------------------------------------------------------------
alter table public.ticket_statuses
	add column if not exists is_category_default boolean not null default false;

create unique index if not exists ticket_statuses_category_default_idx
	on public.ticket_statuses (workflow_id, category)
	where is_category_default;

-- ---------------------------------------------------------------------
-- 2. Rename in place (ids kept). Guarded against a workflow that already
--    carries the new name, so the (workflow_id, name) unique holds.
-- ---------------------------------------------------------------------
update public.ticket_statuses st
set name = x.new_name
from (values
	('Next',    'Selected for Development'),
	('Doing',   'In Progress'),
	('Verify',  'In Review'),
	('Waiting', 'Waiting on 3rd Party')
) as x(old_name, new_name)
where st.name = x.old_name
  and not exists (
	select 1 from public.ticket_statuses s2
	where s2.workflow_id = st.workflow_id and s2.name = x.new_name
  );

-- ---------------------------------------------------------------------
-- 3. Insert the four new statuses into every workflow
-- ---------------------------------------------------------------------
insert into public.ticket_statuses (space_id, created_by, workflow_id, name, category, sort_order)
select wf.space_id, wf.created_by, wf.id, x.name, x.category, x.ord
from public.ticket_workflows wf
cross join (values
	('Testing',                'verify',  5),
	('Waiting on my Decision', 'next',    7),
	('On Hold',                'backlog', 8),
	('Closed',                 'done',   10)
) as x(name, category, ord)
on conflict (workflow_id, name) do nothing;

-- ---------------------------------------------------------------------
-- 4. Display / board order (R1) and the category defaults (§18.2)
-- ---------------------------------------------------------------------
update public.ticket_statuses st
set sort_order = x.ord
from (values
	('Inbox',                    1),
	('Selected for Development', 2),
	('In Progress',              3),
	('In Review',                4),
	('Testing',                  5),
	('Waiting on 3rd Party',     6),
	('Waiting on my Decision',   7),
	('On Hold',                  8),
	('Done',                     9),
	('Closed',                  10),
	('Backlog',                 11),
	('Cancelled',               12)
) as x(name, ord)
where st.name = x.name;

update public.ticket_statuses set is_category_default = false where is_category_default;

update public.ticket_statuses st
set is_category_default = true
where st.name in ('Inbox', 'Selected for Development', 'In Progress', 'In Review',
                  'Waiting on 3rd Party', 'Done', 'Backlog', 'Cancelled')
  and not exists (
	select 1 from public.ticket_statuses s2
	where s2.workflow_id = st.workflow_id and s2.category = st.category
	  and s2.is_category_default and s2.id <> st.id
  );

-- A workflow whose names were customised: make sure every category still
-- has exactly one default (the lowest sort_order wins, as before).
update public.ticket_statuses st
set is_category_default = true
where st.id in (
	select distinct on (workflow_id, category) id
	from public.ticket_statuses s
	where not exists (
		select 1 from public.ticket_statuses d
		where d.workflow_id = s.workflow_id and d.category = s.category and d.is_category_default
	)
	order by workflow_id, category, sort_order, name
);

-- ---------------------------------------------------------------------
-- 5. Resolve a category by its default, then a legacy status by name
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
	order by st.is_category_default desc, st.sort_order
	limit 1
$$;

create or replace function public.ticket_status_named(p_space uuid, p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select st.id
	from public.ticket_statuses st
	join public.ticket_workflows wf on wf.id = st.workflow_id and wf.is_default
	where st.space_id = p_space and st.name = p_name
	limit 1
$$;
revoke all on function public.ticket_status_named(uuid, text) from public;
grant execute on function public.ticket_status_named(uuid, text) to authenticated;

-- on_hold now lives in backlog (On Hold), not waiting.
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
		when 'on_hold'             then 'backlog'
		when 'waiting_third_party' then 'waiting'
		when 'review'              then 'verify'
		when 'pending_review'      then 'verify'
		when 'testing'             then 'verify'
		else case when p_current in ('inbox', 'backlog', 'next') then p_current else 'backlog' end
	end
$$;

/** A legacy status → the specific status where one exists, else the category default. */
create or replace function public.ticket_status_for_legacy(p_space uuid, p_status text, p_current text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		case p_status
			when 'on_hold' then public.ticket_status_named(p_space, 'On Hold')
			when 'testing' then public.ticket_status_named(p_space, 'Testing')
			else null
		end,
		public.ticket_status_for(p_space, public.ticket_legacy_to_category(p_status, p_current))
	)
$$;
revoke all on function public.ticket_status_for_legacy(uuid, text, text) from public;
grant execute on function public.ticket_status_for_legacy(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. The sync trigger: specific statuses both ways
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

	-- (c) status -> legacy status + timestamps
	select name into v_name from public.ticket_statuses where id = new.status_id;
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

	return new;
end
$$;
revoke all on function public.tickets_sync_status() from public;

-- ---------------------------------------------------------------------
-- 7. New spaces get the twelve
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
	insert into public.ticket_statuses (space_id, created_by, workflow_id, name, category, sort_order, is_category_default)
	select p_space, v_owner, v_wf, x.name, x.category, x.ord, x.dflt
	from (values
		('Inbox',                    'inbox',     1, true),
		('Selected for Development', 'next',      2, true),
		('In Progress',              'doing',     3, true),
		('In Review',                'verify',    4, true),
		('Testing',                  'verify',    5, false),
		('Waiting on 3rd Party',     'waiting',   6, true),
		('Waiting on my Decision',   'next',      7, false),
		('On Hold',                  'backlog',   8, false),
		('Done',                     'done',      9, true),
		('Closed',                   'done',     10, false),
		('Backlog',                  'backlog',  11, true),
		('Cancelled',                'cancelled', 12, true)
	) as x(name, category, ord, dflt)
	on conflict (workflow_id, name) do nothing;
	return v_wf;
end
$$;
revoke all on function public.tickets_seed_workflow(uuid) from public;

-- ---------------------------------------------------------------------
-- 8. Done + verified → Closed (R2)
-- ---------------------------------------------------------------------
update public.tickets t
set status_id = public.ticket_status_named(t.space_id, 'Closed')
where t.verified_by is not null
  and public.ticket_category_of(t.status_id) = 'done'
  and public.ticket_status_named(t.space_id, 'Closed') is not null
  and t.status_id <> public.ticket_status_named(t.space_id, 'Closed');

-- ---------------------------------------------------------------------
-- 9. When (R4): the choice behind the dates
-- ---------------------------------------------------------------------
alter table public.tickets
	add column if not exists due_window text
	check (due_window in ('week', 'month', 'month_end', 'weekend', 'someday', 'date'));

-- ---------------------------------------------------------------------
-- 10. Re-date the legacy urgency labels from created_at (R7), open
--     tickets without a deadline only; habits keep their own scheduling.
-- ---------------------------------------------------------------------
update public.tickets t
set deadline_on = case t.urgency
		when 'today'      then (t.created_at at time zone 'Europe/London')::date
		when 'this_week'  then (t.created_at at time zone 'Europe/London')::date + 7
		when 'this_month' then (t.created_at at time zone 'Europe/London')::date + 30
		else t.deadline_on
	end,
    due_window = case t.urgency
		when 'today'      then 'date'
		when 'this_week'  then 'week'
		when 'this_month' then 'month'
		when 'someday'    then 'someday'
		else t.due_window
	end,
    someday = case when t.urgency = 'someday' then true else t.someday end
where t.deadline_on is null
  and t.deleted_at is null
  and coalesce(t.kind, 'task') <> 'habit'
  and t.urgency in ('today', 'this_week', 'this_month', 'someday')
  and public.ticket_category_of(t.status_id) not in ('done', 'cancelled');

-- ---------------------------------------------------------------------
-- 11. The manual urgent flag no longer orders Now (R8)
-- ---------------------------------------------------------------------
update public.tickets set urgent = false where urgent;
