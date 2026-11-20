-- 0172 — the net-worth snapshot leaves the daily log.
--
-- Finance is never shared: its tables are owner-only by the shape of their
-- rules, and a share can never name the finance section (0110, 0111). But
-- the daily net-worth snapshot was not in a finance table. It was written
-- into daily_logs.notes, under a "finance" key, and daily_logs is in the
-- JOURNAL section, which can be shared. Sharing the Journal section with
-- someone would have given them every snapshot: 97 of the 117 daily-log
-- rows on production carried one (found 2026-11-20). No share existed, so
-- nothing was ever read by anyone else.
--
-- This migration:
--   1. makes finance_snapshots, an owner-only finance table, one row per
--      person per day;
--   2. moves every snapshot out of daily_logs.notes into it, and removes
--      the "finance" key from the notes it came from (the rest of each
--      note is untouched);
--   3. puts a trigger on daily_logs so that a "finance" key written into
--      notes from now on, by any code path, is moved out the same way
--      before the row is stored. The boundary is the database's, not the
--      application's.
--
-- The nightly dump taken before this push holds the notes as they were.
--
-- Depends on: 0103 (app.adopt_table, app.personal_space), 0111 (finance is
-- owner-only).

-- ---------------------------------------------------------------------
-- 0. Casts that answer null instead of failing: notes are free text, and
--    most are JSON but nothing says they must be.
-- ---------------------------------------------------------------------
create or replace function app.jsonb_or_null(p text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
	return p::jsonb;
exception when others then
	return null;
end
$$;

create or replace function app.timestamptz_or_null(p text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
	return p::timestamptz;
exception when others then
	return null;
end
$$;

revoke all on function app.jsonb_or_null(text) from public;
revoke all on function app.timestamptz_or_null(text) from public;
grant execute on function app.jsonb_or_null(text) to authenticated, service_role;
grant execute on function app.timestamptz_or_null(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------
create table if not exists public.finance_snapshots (
	id                uuid primary key default gen_random_uuid(),
	snapshot_date     date not null,
	snapshot          jsonb not null check (jsonb_typeof(snapshot) = 'object'),
	last_refreshed_at timestamptz not null default now(),
	source            text not null default 'manual' check (source in ('manual', 'cron')),
	created_at        timestamptz not null default now()
);
select app.adopt_table('finance_snapshots');
alter table public.finance_snapshots enable row level security;
grant all on public.finance_snapshots to service_role;

insert into public.entity_groups (table_name, section, entity_group)
values ('finance_snapshots', 'finance', 'snapshots')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

-- owner-only, the shape every finance table has (0111): the row's space is the reader's own, and nothing else
drop policy if exists "deny all"               on public.finance_snapshots;
drop policy if exists finance_snapshots_select on public.finance_snapshots;
drop policy if exists finance_snapshots_insert on public.finance_snapshots;
drop policy if exists finance_snapshots_update on public.finance_snapshots;
drop policy if exists finance_snapshots_delete on public.finance_snapshots;
create policy finance_snapshots_select on public.finance_snapshots for select to authenticated using (space_id = app.personal_space());
create policy finance_snapshots_insert on public.finance_snapshots for insert to authenticated with check (space_id = app.personal_space());
create policy finance_snapshots_update on public.finance_snapshots for update to authenticated using (space_id = app.personal_space()) with check (space_id = app.personal_space());
create policy finance_snapshots_delete on public.finance_snapshots for delete to authenticated using (space_id = app.personal_space());
grant select, insert, update, delete on public.finance_snapshots to authenticated;
alter table public.finance_snapshots alter column space_id set default app.personal_space();
alter table public.finance_snapshots alter column created_by set default auth.uid();

create unique index if not exists finance_snapshots_one_per_day on public.finance_snapshots (space_id, snapshot_date);

-- ---------------------------------------------------------------------
-- 2. Move what is there
-- ---------------------------------------------------------------------
insert into public.finance_snapshots (space_id, created_by, snapshot_date, snapshot, last_refreshed_at, source)
select
	d.space_id,
	d.created_by,
	d.log_date,
	d.j -> 'finance' -> 'snapshot',
	coalesce(app.timestamptz_or_null(d.j -> 'finance' ->> 'last_refreshed_at'), d.updated_at, now()),
	case when d.j -> 'finance' ->> 'source' in ('manual', 'cron') then d.j -> 'finance' ->> 'source' else 'manual' end
from (select l.*, app.jsonb_or_null(l.notes) as j from public.daily_logs l) d
where jsonb_typeof(d.j) = 'object'
  and jsonb_typeof(d.j -> 'finance') = 'object'
  and jsonb_typeof(d.j -> 'finance' -> 'snapshot') = 'object'
on conflict (space_id, snapshot_date) do nothing;

-- Every note that had a snapshot now has its row; only then is the key taken out of the notes.
do $$
declare
	had  integer;
	have integer;
begin
	select count(*) into had
	from (select l.space_id, l.log_date, app.jsonb_or_null(l.notes) as j from public.daily_logs l) d
	where jsonb_typeof(d.j) = 'object' and jsonb_typeof(d.j -> 'finance' -> 'snapshot') = 'object';
	select count(*) into have
	from (select l.space_id, l.log_date, app.jsonb_or_null(l.notes) as j from public.daily_logs l) d
	join public.finance_snapshots s on s.space_id = d.space_id and s.snapshot_date = d.log_date
	where jsonb_typeof(d.j) = 'object' and jsonb_typeof(d.j -> 'finance' -> 'snapshot') = 'object';
	if had <> have then
		raise exception 'finance snapshots: % notes carry a snapshot but only % have a row; nothing was removed', had, have;
	end if;
end
$$;

update public.daily_logs l
set notes = (app.jsonb_or_null(l.notes) - 'finance')::text
where jsonb_typeof(app.jsonb_or_null(l.notes)) = 'object'
  and app.jsonb_or_null(l.notes) ? 'finance';

-- ---------------------------------------------------------------------
-- 3. Keep it out
-- ---------------------------------------------------------------------
create or replace function app.daily_logs_keep_finance_out()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	j jsonb := app.jsonb_or_null(new.notes);
	f jsonb;
begin
	if j is null or jsonb_typeof(j) <> 'object' or not (j ? 'finance') then
		return new;
	end if;
	f := j -> 'finance';
	-- Kept only when the writer is writing their own log (or the system is, with nobody signed in). Someone
	-- with a share on another person's log cannot plant a figure in that person's finance history: the key
	-- is dropped and nothing is stored.
	if jsonb_typeof(f) = 'object' and jsonb_typeof(f -> 'snapshot') = 'object'
	   and (auth.uid() is null or new.space_id = app.personal_space()) then
		insert into public.finance_snapshots (space_id, created_by, snapshot_date, snapshot, last_refreshed_at, source)
		values (
			new.space_id,
			new.created_by,
			new.log_date,
			f -> 'snapshot',
			coalesce(app.timestamptz_or_null(f ->> 'last_refreshed_at'), now()),
			case when f ->> 'source' in ('manual', 'cron') then f ->> 'source' else 'manual' end
		)
		on conflict (space_id, snapshot_date) do update
			set snapshot = excluded.snapshot, last_refreshed_at = excluded.last_refreshed_at, source = excluded.source;
	end if;
	new.notes := (j - 'finance')::text;
	return new;
end
$$;
revoke all on function app.daily_logs_keep_finance_out() from public;

drop trigger if exists daily_logs_00_keep_finance_out on public.daily_logs;
create trigger daily_logs_00_keep_finance_out
	before insert or update of notes on public.daily_logs
	for each row execute function app.daily_logs_keep_finance_out();

-- ---------------------------------------------------------------------
-- 4. Self-check
-- ---------------------------------------------------------------------
do $$
begin
	if exists (select 1 from public.daily_logs l where jsonb_typeof(app.jsonb_or_null(l.notes)) = 'object' and app.jsonb_or_null(l.notes) ? 'finance') then
		raise exception 'finance snapshots: a daily log still carries a finance key';
	end if;
	if not exists (select 1 from public.entity_groups where table_name = 'finance_snapshots' and section = 'finance') then
		raise exception 'finance snapshots: the table is not in the finance section';
	end if;
end
$$;
