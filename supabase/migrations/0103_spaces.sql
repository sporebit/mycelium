-- Migration: spaces, entity_groups, the teams scaffold, and the adoption
-- helper every domain migration (0104–0109) calls. P12 Part 2.
--
-- Every record in the app is about to belong to a SPACE. A user has one
-- personal space; a team has one team space (Part 4). Grants (Part 3/4)
-- attach to spaces at section + entity-group grain, and every RLS policy
-- from Part 3 on is a single test: is this row's space_id in the set of
-- spaces the caller may reach for this group and verb.
--
-- What this file creates:
--   1. teams — scaffold only (Part 4 fills it), created first because
--      spaces.team_id references it and teams.space_id references spaces.
--   2. spaces — kind personal|team; a personal space names its owner, a
--      team space names its team, never both. One personal space per user.
--   3. entity_groups — table_name → (section, entity_group), seeded from
--      lib/access/registry.ts (entityGroupSeedRows()). A test proves the
--      two agree, so the registry cannot drift from what policies key on.
--   4. app.personal_space() — the caller's personal space (RLS uses it for
--      finance, which is never shared). app.personal_space_for_legacy(text)
--      bridges the four SQL functions that still take a USER_ID text
--      argument until Part 3 rewrites their callers.
--   5. A trigger that gives every new profile a personal space, and Phil's
--      profile + personal space created explicitly (his profile may predate
--      the trigger on the hosted project — see the cutover note).
--   6. app.adopt_table(table, parent_table, parent_col) — adds space_id
--      (backfilled from the parent row, else Phil's personal space), makes
--      it NOT NULL with an FK and index; adds created_by uuid (from the
--      legacy mapping where a user_id text column exists, else the space
--      owner); rebuilds every index, unique constraint and primary key that
--      was keyed on user_id to key on space_id instead; drops the legacy
--      app.user_id policies; then drops user_id. It REFUSES (raises) if any
--      user_id value maps to no auth user — that is the STOP condition the
--      prompt requires, and it is what the replay against the live dump is
--      for. Kept after Part 2 so a future table can be adopted the same way.
--   7. Shared-reference tables become readable by authenticated.
--
-- CUTOVER NOTE (Part 7): this migration inserts Phil's personal space with
-- owner_user_id = app.legacy_user_uid('phil'), which is an FK to
-- auth.users. His live auth user must therefore exist WITH THAT ID before
-- `supabase db push` runs — insert it as supabase/seed.sql does, then push.
-- The migration raises a clear error if the user is missing.
--
-- Depends on: 0102 (profiles, app schema, app.legacy_user_uid).
-- Rollback (order matters):
--   drop function if exists app.adopt_table(text, text, text);
--   drop trigger if exists on_profile_created on public.profiles;
--   drop function if exists app.handle_new_profile();
--   drop function if exists app.personal_space_for_legacy(text);
--   drop function if exists app.personal_space();
--   alter table public.profiles drop constraint if exists profiles_personal_space_id_fkey;
--   drop table if exists public.entity_groups;
--   alter table public.teams drop constraint if exists teams_space_id_fkey;
--   drop table if exists public.spaces;
--   drop table if exists public.teams;

-- ---------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------

do $$
begin
	if not exists (select 1 from auth.users where id = app.legacy_user_uid('phil')) then
		raise exception using
			message = 'Phil''s auth user (app.legacy_user_uid(''phil'')) does not exist. Create it with that id before applying 0103 — see supabase/seed.sql for the shape.';
	end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1. teams (scaffold)
-- ---------------------------------------------------------------------

create table if not exists public.teams (
	id                uuid        primary key default gen_random_uuid(),
	name              text        not null,
	slug              text        not null unique,
	-- FK to spaces added below, after spaces exists.
	space_id          uuid,
	owner_user_id     uuid        not null references auth.users (id) on delete restrict,
	successor_user_id uuid        references auth.users (id) on delete set null,
	created_at        timestamptz not null default now(),
	constraint teams_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

-- ---------------------------------------------------------------------
-- 2. spaces
-- ---------------------------------------------------------------------

create table if not exists public.spaces (
	id            uuid        primary key default gen_random_uuid(),
	kind          text        not null check (kind in ('personal', 'team')),
	owner_user_id uuid        references auth.users (id) on delete cascade,
	team_id       uuid        references public.teams (id) on delete cascade,
	created_at    timestamptz not null default now(),
	constraint spaces_kind_shape check (
		(kind = 'personal' and owner_user_id is not null and team_id is null) or
		(kind = 'team'     and team_id is not null and owner_user_id is null)
	)
);

create unique index if not exists spaces_one_personal_per_user
	on public.spaces (owner_user_id) where kind = 'personal';
create unique index if not exists spaces_one_per_team
	on public.spaces (team_id) where kind = 'team';

alter table public.teams
	drop constraint if exists teams_space_id_fkey;
alter table public.teams
	add constraint teams_space_id_fkey
	foreign key (space_id) references public.spaces (id) on delete set null;

alter table public.profiles
	drop constraint if exists profiles_personal_space_id_fkey;
alter table public.profiles
	add constraint profiles_personal_space_id_fkey
	foreign key (personal_space_id) references public.spaces (id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. entity_groups, seeded from lib/access/registry.ts
-- ---------------------------------------------------------------------

create table if not exists public.entity_groups (
	table_name   text primary key,
	section      text not null check (section in (
		'organisation', 'fitness', 'health', 'finance', 'studio', 'drops',
		'ventures', 'journal', 'places', 'reminders', 'media', 'platform')),
	entity_group text not null
);

create index if not exists entity_groups_section_group_idx
	on public.entity_groups (section, entity_group);

insert into public.entity_groups (table_name, section, entity_group) values
	('tasks', 'organisation', 'tasks'),
	('task_comments', 'organisation', 'tasks'),
	('task_activity', 'organisation', 'tasks'),
	('projects', 'organisation', 'tasks'),
	('people', 'organisation', 'people'),
	('people_mentions', 'organisation', 'people'),
	('people_aliases', 'organisation', 'people'),
	('entities', 'organisation', 'people'),
	('raw_captures', 'organisation', 'captures'),
	('pending_entities', 'organisation', 'captures'),
	('routing_rules', 'organisation', 'captures'),
	('entity_review_rules', 'organisation', 'captures'),
	('context_options', 'organisation', 'captures'),
	('purchases', 'organisation', 'purchases'),
	('receipts', 'organisation', 'purchases'),
	('receipt_images', 'organisation', 'purchases'),
	('receipt_lines', 'organisation', 'purchases'),
	('receipt_participants', 'organisation', 'purchases'),
	('receipt_line_shares', 'organisation', 'purchases'),
	('receipt_settlements', 'organisation', 'purchases'),
	('events', 'organisation', 'events'),
	('workout_programmes', 'fitness', 'programmes'),
	('workout_programme_phases', 'fitness', 'programmes'),
	('workout_programme_sessions', 'fitness', 'programmes'),
	('workout_programme_exercises', 'fitness', 'programmes'),
	('workouts', 'fitness', 'programmes'),
	('workout_sessions', 'fitness', 'sessions'),
	('workout_session_exercises', 'fitness', 'sessions'),
	('workout_sets', 'fitness', 'sessions'),
	('workout_session_types', 'fitness', 'sessions'),
	('pending_workout_routes', 'fitness', 'sessions'),
	('body_metrics', 'fitness', 'body'),
	('health_metrics', 'fitness', 'body'),
	('health_workouts', 'fitness', 'body'),
	('exercise_baselines', 'fitness', 'body'),
	('exercise_pain_logs', 'fitness', 'body'),
	('exercise_aliases', 'fitness', 'body'),
	('foods', 'health', 'nutrition'),
	('meal_groups', 'health', 'nutrition'),
	('nutrition_logs', 'health', 'nutrition'),
	('recipes', 'health', 'nutrition'),
	('shopping_lists', 'health', 'nutrition'),
	('meal_plan', 'health', 'nutrition'),
	('nutrition_targets', 'health', 'nutrition'),
	('supplements', 'health', 'supplements'),
	('supplement_logs', 'health', 'supplements'),
	('blood_test_sessions', 'health', 'clinical'),
	('blood_test_results', 'health', 'clinical'),
	('gut_health_logs', 'health', 'clinical'),
	('eye_prescriptions', 'health', 'clinical'),
	('bank_accounts', 'finance', 'banking'),
	('transactions', 'finance', 'banking'),
	('paypal_payments', 'finance', 'banking'),
	('investments', 'finance', 'investments'),
	('accounts', 'finance', 'subscriptions'),
	('pc_components', 'studio', 'pc'),
	('pc_metrics', 'studio', 'pc'),
	('pc_metrics_hourly', 'studio', 'pc'),
	('spotify_tokens', 'studio', 'spotify'),
	('spotify_plays', 'studio', 'spotify'),
	('drops', 'drops', 'drops'),
	('wishlist_items', 'drops', 'drops'),
	('raffle_entries', 'drops', 'drops'),
	('drop_monitors', 'drops', 'drops'),
	('ventures', 'ventures', 'ventures'),
	('venture_steps', 'ventures', 'ventures'),
	('venture_ads', 'ventures', 'ventures'),
	('venture_inspiration', 'ventures', 'ventures'),
	('media_items', 'media', 'media'),
	('media_episodes', 'media', 'media'),
	('journal_entries', 'journal', 'journal'),
	('journal_daily_summaries', 'journal', 'journal'),
	('daily_logs', 'journal', 'daily_logs'),
	('places', 'places', 'places'),
	('reminders', 'reminders', 'reminders'),
	('user_settings', 'platform', 'core'),
	('dashboard_layouts', 'platform', 'core'),
	('push_subscriptions', 'platform', 'core'),
	('audit_log', 'platform', 'core'),
	('agent_conversations', 'platform', 'core'),
	('agent_messages', 'platform', 'core'),
	('bin_schedule_config', 'platform', 'core'),
	('bin_garden_seasons', 'platform', 'core'),
	('bin_google_events', 'platform', 'core'),
	('memory_chunks', 'platform', 'memory')
on conflict (table_name) do update
	set section = excluded.section, entity_group = excluded.entity_group;

-- ---------------------------------------------------------------------
-- 4. Personal-space functions
-- ---------------------------------------------------------------------

create or replace function app.personal_space()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select p.personal_space_id from public.profiles p where p.id = auth.uid()
$$;

revoke all on function app.personal_space() from public;
grant execute on function app.personal_space() to authenticated, service_role;

-- Bridge for SQL functions that still take the USER_ID text argument
-- (search_memory_chunks, spend_by_category, spend_by_month, txn_agg).
-- Part 3 rewrites those to use auth.uid() and drops this.
create or replace function app.personal_space_for_legacy(legacy_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select p.personal_space_id
	from public.profiles p
	where p.id = app.legacy_user_uid(legacy_id)
$$;

revoke all on function app.personal_space_for_legacy(text) from public;
grant execute on function app.personal_space_for_legacy(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Every profile gets a personal space; Phil's explicitly
-- ---------------------------------------------------------------------

create or replace function app.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.personal_space_id is null then
		-- Idempotent per owner: an upsert on profiles fires this trigger even
		-- when the row already exists, so reuse the space if there is one.
		insert into public.spaces (kind, owner_user_id)
		values ('personal', new.id)
		on conflict (owner_user_id) where kind = 'personal'
			do update set kind = excluded.kind
		returning id into new.personal_space_id;
	end if;
	return new;
end
$$;

revoke all on function app.handle_new_profile() from public;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
	before insert on public.profiles
	for each row execute function app.handle_new_profile();

do $$
declare
	v_phil  uuid := app.legacy_user_uid('phil');
	v_space uuid;
begin
	-- Profile: exists locally (0102 trigger + seed); may not on live. A
	-- plain insert goes through on_profile_created, which creates the space.
	if exists (select 1 from public.profiles where id = v_phil) then
		update public.profiles set is_instance_owner = true where id = v_phil;
	else
		insert into public.profiles (id, display_name, is_instance_owner)
		values (v_phil, 'Phil', true);
	end if;

	select personal_space_id into v_space from public.profiles where id = v_phil;
	if v_space is null then
		insert into public.spaces (kind, owner_user_id)
		values ('personal', v_phil)
		on conflict (owner_user_id) where kind = 'personal'
			do update set kind = excluded.kind
		returning id into v_space;
		update public.profiles set personal_space_id = v_space where id = v_phil;
	end if;
end
$$;

-- ---------------------------------------------------------------------
-- 6. app.adopt_table
-- ---------------------------------------------------------------------

create or replace function app.adopt_table(
	p_table        text,
	p_parent_table text default null,
	p_parent_col   text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
	v_phil        uuid := app.legacy_user_uid('phil');
	v_phil_space  uuid;
	v_rel         regclass := ('public.' || quote_ident(p_table))::regclass;
	v_user_type   text;
	v_bad         bigint;
	v_pk_name     text;
	v_pk_cols     text;
	v_name        text;
	v_def         text;
	r             record;
begin
	select personal_space_id into v_phil_space from public.profiles where id = v_phil;
	if v_phil_space is null then
		raise exception 'adopt_table(%): Phil''s personal space does not exist', p_table;
	end if;
	if (p_parent_table is null) <> (p_parent_col is null) then
		raise exception 'adopt_table(%): parent table and column must be given together', p_table;
	end if;

	-- 1. space_id -------------------------------------------------------
	execute format('alter table public.%I add column if not exists space_id uuid', p_table);

	if p_parent_table is not null then
		execute format(
			'update public.%I t set space_id = p.space_id from public.%I p where t.%I = p.id and t.space_id is null',
			p_table, p_parent_table, p_parent_col);
	end if;
	-- Cutover rule: everything that exists today is Phil's.
	execute format('update public.%I set space_id = $1 where space_id is null', p_table)
		using v_phil_space;

	execute format('alter table public.%I alter column space_id set not null', p_table);
	execute format('alter table public.%I drop constraint if exists %I', p_table, p_table || '_space_id_fkey');
	execute format(
		'alter table public.%I add constraint %I foreign key (space_id) references public.spaces (id) on delete cascade',
		p_table, p_table || '_space_id_fkey');
	execute format('create index if not exists %I on public.%I (space_id)', p_table || '_space_id_idx', p_table);

	-- 2. created_by -----------------------------------------------------
	select data_type into v_user_type
	from information_schema.columns
	where table_schema = 'public' and table_name = p_table and column_name = 'user_id';

	execute format('alter table public.%I add column if not exists created_by uuid', p_table);

	if v_user_type = 'text' then
		execute format(
			'select count(*) from public.%I where user_id is not null and app.legacy_user_uid(user_id) is null',
			p_table) into v_bad;
		if v_bad > 0 then
			raise exception using
				message = format('STOP: public.%s has %s row(s) whose user_id maps to no auth user. Not coerced — resolve the mapping before continuing.', p_table, v_bad);
		end if;
		execute format(
			'update public.%I set created_by = app.legacy_user_uid(user_id) where created_by is null and user_id is not null',
			p_table);
	end if;
	-- No user_id column, a uuid one, or a null value: the space owner.
	execute format(
		'update public.%I t set created_by = s.owner_user_id from public.spaces s where s.id = t.space_id and t.created_by is null',
		p_table);

	execute format('alter table public.%I drop constraint if exists %I', p_table, p_table || '_created_by_fkey');
	execute format(
		'alter table public.%I add constraint %I foreign key (created_by) references auth.users (id) on delete set null',
		p_table, p_table || '_created_by_fkey');

	-- 3. Retire user_id -------------------------------------------------
	if v_user_type is not null then
		-- Legacy app.user_id policies. Part 3 writes every policy afresh.
		for r in
			select policyname from pg_policies
			where schemaname = 'public' and tablename = p_table
			  and (coalesce(qual, '') || coalesce(with_check, '')) ~ '\muser_id\M'
		loop
			execute format('drop policy if exists %I on public.%I', r.policyname, p_table);
		end loop;

		-- Primary key on user_id → same key on space_id.
		select c.conname,
		       string_agg(quote_ident(a.attname), ', ' order by array_position(c.conkey, a.attnum))
		  into v_pk_name, v_pk_cols
		from pg_constraint c
		join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
		where c.conrelid = v_rel and c.contype = 'p'
		  and exists (
			select 1 from pg_attribute b
			where b.attrelid = c.conrelid and b.attnum = any (c.conkey) and b.attname = 'user_id')
		group by c.conname;
		if v_pk_name is not null then
			execute format('alter table public.%I drop constraint %I', p_table, v_pk_name);
			execute format('alter table public.%I add primary key (%s)', p_table, replace(v_pk_cols, 'user_id', 'space_id'));
		end if;

		-- Unique constraints on user_id → same constraint on space_id.
		for r in
			select conname, pg_get_constraintdef(oid) as def
			from pg_constraint
			where conrelid = v_rel and contype = 'u' and pg_get_constraintdef(oid) ~ '\muser_id\M'
		loop
			execute format('alter table public.%I drop constraint %I', p_table, r.conname);
			v_name := app.space_name(r.conname);
			execute format('alter table public.%I add constraint %I %s', p_table, v_name, replace(r.def, 'user_id', 'space_id'));
		end loop;

		-- Remaining indexes on user_id → same index on space_id.
		for r in
			select indexname, indexdef from pg_indexes
			where schemaname = 'public' and tablename = p_table and indexdef ~ '\muser_id\M'
		loop
			execute format('drop index if exists public.%I', r.indexname);
			v_def := replace(r.indexdef, 'user_id', 'space_id');
			-- A bare (user_id) index becomes a bare (space_id) index, which
			-- the helper already created above; do not duplicate it.
			if v_def ~ 'USING btree \(space_id\)$' then
				continue;
			end if;
			v_name := app.space_name(r.indexname);
			if to_regclass('public.' || quote_ident(v_name)) is not null then
				v_name := v_name || '_legacy';
			end if;
			-- Rename first (the old name may itself contain "user_id"), then
			-- re-key the columns.
			v_def := replace(r.indexdef, 'INDEX ' || r.indexname || ' ', 'INDEX ' || v_name || ' ');
			v_def := replace(v_def, 'user_id', 'space_id');
			execute v_def;
		end loop;

		execute format('alter table public.%I drop column user_id', p_table);
	end if;
end
$$;

-- Rename helper for indexes/constraints: user_id → space_id, else _user → _space.
create or replace function app.space_name(old_name text)
returns text
language sql
immutable
as $$
	select case
		when old_name like '%user_id%' then replace(old_name, 'user_id', 'space_id')
		when old_name ~ '_user(_|$)'   then regexp_replace(old_name, '_user(_|$)', '_space\1')
		else old_name || '_space'
	end
$$;

revoke all on function app.adopt_table(text, text, text) from public;
revoke all on function app.space_name(text) from public;

-- ---------------------------------------------------------------------
-- 7. Policies and grants for the new tables; shared reference readable
-- ---------------------------------------------------------------------

alter table public.spaces        enable row level security;
alter table public.teams         enable row level security;
alter table public.entity_groups enable row level security;

-- A user sees their own personal space. Part 3 widens this to every space
-- app.accessible_spaces() returns; Part 4 adds team spaces by membership.
drop policy if exists spaces_select_own on public.spaces;
create policy spaces_select_own
	on public.spaces for select to authenticated
	using (owner_user_id = auth.uid());

drop policy if exists teams_select_owner on public.teams;
create policy teams_select_owner
	on public.teams for select to authenticated
	using (owner_user_id = auth.uid());

drop policy if exists entity_groups_read on public.entity_groups;
create policy entity_groups_read
	on public.entity_groups for select to authenticated
	using (true);

grant select on public.spaces, public.teams, public.entity_groups to authenticated;
grant all on public.spaces, public.teams, public.entity_groups to service_role;

-- Shared reference: no space_id, read-only for authenticated. agent_memory
-- stays service-role only (its deny-all remains).
do $$
declare t text;
begin
	foreach t in array array['agents', 'workout_exercises', 'blood_test_markers', 'cook_guides', 'weather_cache'] loop
		execute format('drop policy if exists "deny all" on public.%I', t);
		execute format('drop policy if exists %I on public.%I', t || '_read_authenticated', t);
		execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read_authenticated', t);
		execute format('grant select on public.%I to authenticated', t);
	end loop;
end
$$;
