-- 0156 — Four-Day Week Tracker (organisation.hours). Spec: claude/four-day-week-spec.md.
--
-- Phil's Everlight working hours, kept here instead of the Excel workbook
-- (decision D1: the one exception to tickets-spec decision 3). Five tables,
-- all registered through app.register_table, which since 0141 also runs the
-- 0111 policy + grant loop for the table. The self-check at the end fails
-- the push if any of them came out without its four space policies.
--
-- Principle carried over from the workbook: data is entered in one place and
-- every figure is derived, never stored. Integer minutes everywhere.
--
--   hours_settings       one row per space: targets, thresholds, ticket base
--                        URL, the Friday block-out text
--   hours_entries        the Log: date (nullable for open backlog items),
--                        minutes (null = open), estimate, description, the
--                        ticket as typed and the key derived from it, the
--                        Logged tick, provenance for imports, soft delete
--   hours_absences       annual leave / sick / other, credits minutes on a day
--   hours_bank_holidays  England and Wales; credits a standard day
--   hours_import_runs    one row per applied import with what it takes to
--                        undo it (inserted ids, before-images of updates)
--
-- Two SQL functions do the writes of an import in one transaction under RLS
-- (SECURITY INVOKER): hours_apply_import(plan) and hours_undo_import(run).
-- The dry run that builds the plan is TypeScript (lib/hours/import.ts).
--
-- Nothing from the private seed is in this file. Depends on: 0155.
-- Rollback: drop the two functions, the five tables and their entity_groups rows.

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.hours_settings (
	id                           uuid primary key default gen_random_uuid(),
	contracted_minutes_per_week  integer not null default 2250 check (contracted_minutes_per_week between 1 and 10080),
	standard_day_minutes         integer not null default 450  check (standard_day_minutes between 1 and 1440),
	checkpoint_threshold_minutes integer not null default 1500 check (checkpoint_threshold_minutes between 0 and 10080),
	checkpoint_label             text    not null default 'Wednesday 13:00',
	tracking_start               date    not null default current_date,
	review_length_weeks          integer not null default 6 check (review_length_weeks between 1 and 104),
	wed_minutes_before_1300      integer not null default 210 check (wed_minutes_before_1300 between 0 and 1440),
	wed_minutes_after_1300       integer not null default 300 check (wed_minutes_after_1300 between 0 and 1440),
	ticket_base_url              text    not null default '',
	catch_all_tickets            jsonb   not null default '[]'::jsonb,
	block_out_recipients         text[]  not null default '{}',
	block_out_subject_template   text    not null default '',
	block_out_body_lines         text[]  not null default '{}',
	created_at                   timestamptz not null default now(),
	updated_at                   timestamptz not null default now()
);
select app.register_table('hours_settings', 'organisation', 'hours');
create unique index if not exists hours_settings_space_idx on public.hours_settings (space_id);
comment on table public.hours_settings is
	'Four-Day Week Tracker settings, one row per space (0156): contracted minutes, standard day, Wednesday checkpoint threshold, tracking start, ticket base URL, block-out text.';

create table if not exists public.hours_entries (
	id               uuid primary key default gen_random_uuid(),
	entry_date       date,
	minutes          integer check (minutes between 0 and 1440),
	estimate_minutes integer check (estimate_minutes between 0 and 1440),
	description      text    not null default '',
	ticket_raw       text    not null default '',
	ticket_key       text,
	logged           boolean not null default false,
	source           text    not null default 'manual' check (source in ('manual', 'import')),
	source_row       integer,
	deleted_at       timestamptz,
	created_at       timestamptz not null default now(),
	updated_at       timestamptz not null default now()
);
select app.register_table('hours_entries', 'organisation', 'hours');
create index if not exists hours_entries_space_date_idx
	on public.hours_entries (space_id, entry_date) where deleted_at is null;
create index if not exists hours_entries_space_key_idx
	on public.hours_entries (space_id, ticket_key) where deleted_at is null and ticket_key is not null;
-- the workbook row an imported entry came from: makes the first load idempotent
create unique index if not exists hours_entries_space_source_row_idx
	on public.hours_entries (space_id, source_row) where source_row is not null;
comment on table public.hours_entries is
	'The Log of the Four-Day Week Tracker (0156): one row per piece of work. minutes null = an open backlog item; entry_date null is allowed for those. ticket_key is derived from ticket_raw by lib/hours/ticket.ts. Soft delete.';

create table if not exists public.hours_absences (
	id           uuid primary key default gen_random_uuid(),
	absence_date date    not null,
	type         text    not null default 'Annual leave' check (type in ('Annual leave', 'Sick', 'Other')),
	minutes      integer not null default 450 check (minutes between 0 and 1440),
	note         text    not null default '',
	created_at   timestamptz not null default now(),
	updated_at   timestamptz not null default now()
);
select app.register_table('hours_absences', 'organisation', 'hours');
create unique index if not exists hours_absences_space_date_idx on public.hours_absences (space_id, absence_date);
comment on table public.hours_absences is 'Absences that credit minutes on a day (0156). One per date per space.';

create table if not exists public.hours_bank_holidays (
	id           uuid primary key default gen_random_uuid(),
	holiday_date date not null,
	name         text not null default '',
	created_at   timestamptz not null default now()
);
select app.register_table('hours_bank_holidays', 'organisation', 'hours');
create unique index if not exists hours_bank_holidays_space_date_idx on public.hours_bank_holidays (space_id, holiday_date);
comment on table public.hours_bank_holidays is 'England and Wales bank holidays (0156); each credits a standard day. Refreshable from gov.uk.';

create table if not exists public.hours_import_runs (
	id         uuid primary key default gen_random_uuid(),
	ran_at     timestamptz not null default now(),
	filename   text not null default '',
	format     text not null default 'json' check (format in ('json', 'xlsx', 'paste')),
	counts     jsonb not null default '{}'::jsonb,
	undo       jsonb not null default '{}'::jsonb,
	undone_at  timestamptz
);
select app.register_table('hours_import_runs', 'organisation', 'hours');
create index if not exists hours_import_runs_space_ran_idx on public.hours_import_runs (space_id, ran_at desc);
comment on table public.hours_import_runs is 'One row per applied import of the Four-Day Week Tracker (0156): counts, and the inserted ids + before-images needed to undo it.';

-- ---------------------------------------------------------------------
-- 2. Apply an import plan in one transaction (SECURITY INVOKER: RLS applies)
-- ---------------------------------------------------------------------
--
-- p_plan (built by the TypeScript dry run, lib/hours/import.ts):
-- {
--   "filename": "seed.json", "format": "json", "counts": {...},
--   "settings": { ...columns of hours_settings to set... } | null,
--   "entries_insert": [ { entry_date, minutes, estimate_minutes, description,
--                         ticket_raw, ticket_key, logged, source_row } ],
--   "entries_update": [ { id, entry_date, minutes, estimate_minutes,
--                         description, ticket_raw, ticket_key, logged } ],
--   "absences_insert": [ { absence_date, type, minutes } ],
--   "holidays_insert": [ { holiday_date, name } ]
-- }
-- Returns { run_id, inserted, updated, absences, holidays, settings }.

create or replace function public.hours_apply_import(p_plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_run_id         uuid;
	v_inserted_ids   uuid[] := '{}';
	v_absence_ids    uuid[] := '{}';
	v_holiday_ids    uuid[] := '{}';
	v_before         jsonb  := '[]'::jsonb;
	v_settings_before jsonb := null;
	v_settings_created boolean := false;
	v_settings_id    uuid;
	v_updated        integer := 0;
	v_space          uuid := app.personal_space();
	r                record;
	s                jsonb;
begin
	-- entries: inserts
	with ins as (
		insert into public.hours_entries
			(entry_date, minutes, estimate_minutes, description, ticket_raw, ticket_key, logged, source, source_row)
		select
			nullif(x.entry_date, '')::date,
			x.minutes, x.estimate_minutes,
			coalesce(x.description, ''), coalesce(x.ticket_raw, ''), x.ticket_key,
			coalesce(x.logged, false), 'import', x.source_row
		from jsonb_to_recordset(coalesce(p_plan->'entries_insert', '[]'::jsonb)) as x(
			entry_date text, minutes integer, estimate_minutes integer, description text,
			ticket_raw text, ticket_key text, logged boolean, source_row integer)
		returning id
	)
	select coalesce(array_agg(id), '{}') into v_inserted_ids from ins;

	-- entries: updates, keeping the before-image of every row touched
	for r in
		select * from jsonb_to_recordset(coalesce(p_plan->'entries_update', '[]'::jsonb)) as x(
			id uuid, entry_date text, minutes integer, estimate_minutes integer, description text,
			ticket_raw text, ticket_key text, logged boolean)
	loop
		select to_jsonb(e) into s from public.hours_entries e where e.id = r.id and e.space_id = v_space;
		if s is null then
			raise exception 'hours_apply_import: entry % is not yours or does not exist', r.id;
		end if;
		v_before := v_before || jsonb_build_array(s);
		update public.hours_entries set
			entry_date       = nullif(r.entry_date, '')::date,
			minutes          = r.minutes,
			estimate_minutes = r.estimate_minutes,
			description      = coalesce(r.description, ''),
			ticket_raw       = coalesce(r.ticket_raw, ''),
			ticket_key       = r.ticket_key,
			logged           = coalesce(r.logged, false),
			deleted_at       = null,
			updated_at       = now()
		where id = r.id;
		v_updated := v_updated + 1;
	end loop;

	-- absences and bank holidays: inserts only (never deleted by an import)
	with ins as (
		insert into public.hours_absences (absence_date, type, minutes)
		select x.absence_date::date, coalesce(x.type, 'Annual leave'), coalesce(x.minutes, 450)
		from jsonb_to_recordset(coalesce(p_plan->'absences_insert', '[]'::jsonb)) as x(absence_date text, type text, minutes integer)
		on conflict (space_id, absence_date) do nothing
		returning id
	)
	select coalesce(array_agg(id), '{}') into v_absence_ids from ins;

	with ins as (
		insert into public.hours_bank_holidays (holiday_date, name)
		select x.holiday_date::date, coalesce(x.name, '')
		from jsonb_to_recordset(coalesce(p_plan->'holidays_insert', '[]'::jsonb)) as x(holiday_date text, name text)
		on conflict (space_id, holiday_date) do nothing
		returning id
	)
	select coalesce(array_agg(id), '{}') into v_holiday_ids from ins;

	-- settings: create the row if the space has none, then patch the given keys
	if p_plan ? 'settings' and jsonb_typeof(p_plan->'settings') = 'object' then
		select id, to_jsonb(hs) into v_settings_id, v_settings_before from public.hours_settings hs where hs.space_id = v_space;
		if v_settings_id is null then
			insert into public.hours_settings default values returning id into v_settings_id;
			v_settings_created := true;
			v_settings_before := null;
		end if;
		s := p_plan->'settings';
		update public.hours_settings set
			contracted_minutes_per_week  = coalesce((s->>'contracted_minutes_per_week')::integer, contracted_minutes_per_week),
			standard_day_minutes         = coalesce((s->>'standard_day_minutes')::integer, standard_day_minutes),
			checkpoint_threshold_minutes = coalesce((s->>'checkpoint_threshold_minutes')::integer, checkpoint_threshold_minutes),
			checkpoint_label             = coalesce(s->>'checkpoint_label', checkpoint_label),
			tracking_start               = coalesce((s->>'tracking_start')::date, tracking_start),
			review_length_weeks          = coalesce((s->>'review_length_weeks')::integer, review_length_weeks),
			wed_minutes_before_1300      = coalesce((s->>'wed_minutes_before_1300')::integer, wed_minutes_before_1300),
			wed_minutes_after_1300       = coalesce((s->>'wed_minutes_after_1300')::integer, wed_minutes_after_1300),
			ticket_base_url              = coalesce(s->>'ticket_base_url', ticket_base_url),
			catch_all_tickets            = coalesce(s->'catch_all_tickets', catch_all_tickets),
			block_out_recipients         = coalesce((select array_agg(v) from jsonb_array_elements_text(s->'block_out_recipients') v), block_out_recipients),
			block_out_subject_template   = coalesce(s->>'block_out_subject_template', block_out_subject_template),
			block_out_body_lines         = coalesce((select array_agg(v) from jsonb_array_elements_text(s->'block_out_body_lines') v), block_out_body_lines),
			updated_at                   = now()
		where id = v_settings_id;
	end if;

	insert into public.hours_import_runs (filename, format, counts, undo)
	values (
		coalesce(p_plan->>'filename', ''),
		coalesce(p_plan->>'format', 'json'),
		coalesce(p_plan->'counts', '{}'::jsonb) || jsonb_build_object(
			'inserted', coalesce(array_length(v_inserted_ids, 1), 0),
			'updated', v_updated,
			'absences', coalesce(array_length(v_absence_ids, 1), 0),
			'holidays', coalesce(array_length(v_holiday_ids, 1), 0)),
		jsonb_build_object(
			'entries_inserted', to_jsonb(v_inserted_ids),
			'entries_before', v_before,
			'absences_inserted', to_jsonb(v_absence_ids),
			'holidays_inserted', to_jsonb(v_holiday_ids),
			'settings_before', v_settings_before,
			'settings_created', v_settings_created,
			'settings_id', v_settings_id)
	)
	returning id into v_run_id;

	return jsonb_build_object(
		'run_id', v_run_id,
		'inserted', coalesce(array_length(v_inserted_ids, 1), 0),
		'updated', v_updated,
		'absences', coalesce(array_length(v_absence_ids, 1), 0),
		'holidays', coalesce(array_length(v_holiday_ids, 1), 0),
		'settings', (p_plan ? 'settings' and jsonb_typeof(p_plan->'settings') = 'object'));
end
$$;
revoke all on function public.hours_apply_import(jsonb) from public;
grant execute on function public.hours_apply_import(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Undo the last import
-- ---------------------------------------------------------------------

create or replace function public.hours_undo_import(p_run uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_run    public.hours_import_runs%rowtype;
	v_latest uuid;
	v_space  uuid := app.personal_space();
	b        jsonb;
	n_del    integer := 0;
	n_rest   integer := 0;
begin
	select * into v_run from public.hours_import_runs where id = p_run and space_id = v_space;
	if v_run.id is null then
		raise exception 'hours_undo_import: run % not found', p_run;
	end if;
	if v_run.undone_at is not null then
		raise exception 'hours_undo_import: run % was already undone', p_run;
	end if;
	select id into v_latest from public.hours_import_runs
		where space_id = v_space and undone_at is null order by ran_at desc limit 1;
	if v_latest is distinct from p_run then
		raise exception 'hours_undo_import: only the latest import can be undone';
	end if;

	-- rows the import created go away for good; they never existed before it
	with d as (
		delete from public.hours_entries
		where id in (select (x)::uuid from jsonb_array_elements_text(coalesce(v_run.undo->'entries_inserted', '[]'::jsonb)) x)
		returning id
	) select count(*) into n_del from d;
	delete from public.hours_absences
		where id in (select (x)::uuid from jsonb_array_elements_text(coalesce(v_run.undo->'absences_inserted', '[]'::jsonb)) x);
	delete from public.hours_bank_holidays
		where id in (select (x)::uuid from jsonb_array_elements_text(coalesce(v_run.undo->'holidays_inserted', '[]'::jsonb)) x);

	-- rows the import changed go back to their before-image
	for b in select * from jsonb_array_elements(coalesce(v_run.undo->'entries_before', '[]'::jsonb)) loop
		update public.hours_entries set
			entry_date       = (b->>'entry_date')::date,
			minutes          = (b->>'minutes')::integer,
			estimate_minutes = (b->>'estimate_minutes')::integer,
			description      = coalesce(b->>'description', ''),
			ticket_raw       = coalesce(b->>'ticket_raw', ''),
			ticket_key       = b->>'ticket_key',
			logged           = coalesce((b->>'logged')::boolean, false),
			deleted_at       = (b->>'deleted_at')::timestamptz,
			updated_at       = now()
		where id = (b->>'id')::uuid;
		n_rest := n_rest + 1;
	end loop;

	if coalesce((v_run.undo->>'settings_created')::boolean, false) then
		delete from public.hours_settings where id = (v_run.undo->>'settings_id')::uuid;
	elsif v_run.undo ? 'settings_before' and jsonb_typeof(v_run.undo->'settings_before') = 'object' then
		b := v_run.undo->'settings_before';
		update public.hours_settings set
			contracted_minutes_per_week  = (b->>'contracted_minutes_per_week')::integer,
			standard_day_minutes         = (b->>'standard_day_minutes')::integer,
			checkpoint_threshold_minutes = (b->>'checkpoint_threshold_minutes')::integer,
			checkpoint_label             = b->>'checkpoint_label',
			tracking_start               = (b->>'tracking_start')::date,
			review_length_weeks          = (b->>'review_length_weeks')::integer,
			wed_minutes_before_1300      = (b->>'wed_minutes_before_1300')::integer,
			wed_minutes_after_1300       = (b->>'wed_minutes_after_1300')::integer,
			ticket_base_url              = b->>'ticket_base_url',
			catch_all_tickets            = coalesce(b->'catch_all_tickets', '[]'::jsonb),
			block_out_recipients         = coalesce((select array_agg(v) from jsonb_array_elements_text(b->'block_out_recipients') v), '{}'),
			block_out_subject_template   = coalesce(b->>'block_out_subject_template', ''),
			block_out_body_lines         = coalesce((select array_agg(v) from jsonb_array_elements_text(b->'block_out_body_lines') v), '{}'),
			updated_at                   = now()
		where id = (b->>'id')::uuid;
	end if;

	update public.hours_import_runs set undone_at = now() where id = p_run;
	return jsonb_build_object('run_id', p_run, 'deleted', n_del, 'restored', n_rest);
end
$$;
revoke all on function public.hours_undo_import(uuid) from public;
grant execute on function public.hours_undo_import(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Self-check (the 0124 lesson, the 0146 shape)
-- ---------------------------------------------------------------------

do $$
declare
	v_tables text[] := array['hours_settings', 'hours_entries', 'hours_absences', 'hours_bank_holidays', 'hours_import_runs'];
	t text;
	n integer;
begin
	foreach t in array v_tables loop
		if not (select c.relrowsecurity from pg_catalog.pg_class c
		        where c.oid = ('public.' || quote_ident(t))::regclass) then
			raise exception 'hours self-check: RLS is off on %', t;
		end if;
		select count(*) into n from pg_catalog.pg_policies
		where schemaname = 'public' and tablename = t and permissive = 'PERMISSIVE'
		  and policyname in (t || '_select', t || '_insert', t || '_update', t || '_delete');
		if n <> 4 then
			raise exception 'hours self-check: % has % of its 4 space policies', t, n;
		end if;
		if exists (select 1 from pg_catalog.pg_policies
		           where schemaname = 'public' and tablename = t and policyname = 'deny all') then
			raise exception 'hours self-check: % still carries deny all', t;
		end if;
		if not exists (select 1 from public.entity_groups where table_name = t and section = 'organisation' and entity_group = 'hours') then
			raise exception 'hours self-check: % is not registered as organisation.hours', t;
		end if;
		if not pg_catalog.has_table_privilege('authenticated', 'public.' || quote_ident(t), 'select')
		   or not pg_catalog.has_table_privilege('service_role', 'public.' || quote_ident(t), 'select') then
			raise exception 'hours self-check: % is missing a grant', t;
		end if;
	end loop;
	raise notice '0156 self-check: % hours tables under RLS with their space policies and grants', array_length(v_tables, 1);
end
$$;
