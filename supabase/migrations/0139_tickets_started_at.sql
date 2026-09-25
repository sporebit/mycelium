-- 0139_tickets_started_at.sql
-- Tasks + Tickets merge, dates list (claude/tasks-merge-spec.md M5, MYC-163).
--
-- Started = the first time a ticket's category enters `doing`. One new
-- column, set once by the 0117/0137 status-sync trigger and never
-- overwritten (leaving and re-entering doing keeps the first date). The
-- backfill takes the earliest ticket_activity row that moved a ticket into
-- doing: a status_id change logged as the category ("doing") or a legacy
-- status write of in_progress. Tickets with no such row stay null — the
-- date is never estimated. No new tables, so RLS is unchanged.
-- Depends on: 0138.

alter table public.tickets add column if not exists started_at timestamptz;
create index if not exists tickets_started_at_idx on public.tickets (space_id, started_at) where started_at is not null;

-- ---------------------------------------------------------------------
-- 1. The sync trigger (0137 body) + started_at
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

	-- (d) 0139: Started = the first entry into doing, kept for ever
	if v_cat = 'doing' and new.started_at is null then
		new.started_at := now();
	end if;

	return new;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Backfill from the activity log, and report
-- ---------------------------------------------------------------------
do $$
declare
	v_total      bigint;
	v_backfilled bigint;
	v_null       bigint;
	v_null_past  bigint;
begin
	with firsts as (
		select a.ticket_id, min(a.created_at) as at
		from public.ticket_activity a
		where (a.field = 'status_id' and a.to_value = 'doing')
		   or (a.field = 'status' and a.to_value = 'in_progress')
		group by a.ticket_id
	)
	update public.tickets t
	set started_at = f.at
	from firsts f
	where f.ticket_id = t.id and t.started_at is null;
	get diagnostics v_backfilled = row_count;

	select count(*) into v_total from public.tickets where deleted_at is null;
	select count(*) into v_null from public.tickets where deleted_at is null and started_at is null;
	-- tickets that are or were past doing (in progress, review, testing, done) with no recorded start
	select count(*) into v_null_past
	from public.tickets t
	join public.ticket_statuses st on st.id = t.status_id
	where t.deleted_at is null and t.started_at is null
	  and (st.category in ('doing', 'verify') or (st.category = 'done'));

	raise notice '0139 started_at: % tickets, % backfilled from ticket_activity, % left null (% of those are in doing/verify/done with no recorded start)',
		v_total, v_backfilled, v_null, v_null_past;
end
$$;
