-- Migration: profiles, the `app` schema, and the legacy identity mapping.
-- P12 Part 1 (identity). First migration authored on branch `multi-user`.
--
-- Until now the app has had exactly one user, identified by the USER_ID
-- environment variable (a text value) and admitted by an HMAC cookie the
-- middleware minted from a shared password. Supabase Auth replaces that.
-- This migration lays the identity foundation the later parts build on:
--
--   1. `app` schema. Home for the SQL functions that policies and app code
--      call (Part 2 adds app.personal_space(), Part 3 app.accessible_spaces()).
--      It is NOT exposed through PostgREST; anything a client must call by
--      RPC lives in public.
--   2. profiles. One row per auth user. `is_instance_owner` marks Phil; a
--      partial unique index guarantees at most one such row. Reading other
--      users' profiles is the ONE place the instance owner sees anyone
--      else's data, and it is names, not content. `personal_space_id` is
--      created here as a bare uuid so Part 2 can add the FK once `spaces`
--      exists, without rewriting this table.
--   3. app.legacy_user_uid(text). The mapping from the old USER_ID text
--      value to the auth user id. Part 2's backfill casts every `user_id
--      text` column through it, and lib/system/identity.ts mirrors it so
--      TypeScript and SQL cannot disagree (a test proves they agree).
--      The uid is fixed rather than generated so that the local seed, Part
--      2's backfill and Part 7's cutover all name the same user.
--   4. A trigger that creates a profile for every new auth user, so no code
--      path can produce an auth user without a profile row.
--   5. public.my_sessions(). The `auth` schema is not exposed to PostgREST,
--      so the security settings page reads the caller's own sessions through
--      this SECURITY DEFINER function. It filters on auth.uid() and returns
--      only the columns a user may see about their own sessions.
--
-- RLS on profiles is PERMISSIVE from the start: 0101's restrictive deny-all
-- was applied to the tables that existed then and is not inherited, and a
-- restrictive `using (false)` would make every permissive policy inert.
-- authenticated may read (own row, or all rows for the instance owner) and
-- update only display_name, by column-level grant, so a user cannot make
-- themselves instance owner.
--
-- Depends on: 0101 (anon/authenticated hold no default privileges, so every
--   grant here is explicit). Verified on the local stack only; Part 7 pushes.
-- Rollback:
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists app.handle_new_auth_user();
--   drop function if exists public.my_sessions();
--   drop function if exists app.is_instance_owner();
--   drop function if exists app.legacy_user_uid(text);
--   drop table if exists public.profiles;
--   drop schema if exists app;

-- ---------------------------------------------------------------------
-- 1. app schema
-- ---------------------------------------------------------------------

create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Legacy identity mapping
-- ---------------------------------------------------------------------

-- The only legacy identity is 'phil' (the USER_ID value). Any other input
-- returns null, and Part 2 treats a null result for a non-null user_id as
-- a STOP condition, never a coercion.
create or replace function app.legacy_user_uid(legacy_id text)
returns uuid
language sql
immutable
parallel safe
set search_path = ''
as $$
	select case legacy_id
		when 'phil' then 'f218ed69-6cbf-49ea-908a-8826f2f1178a'::uuid
		else null
	end
$$;

revoke all on function app.legacy_user_uid(text) from public;
grant execute on function app.legacy_user_uid(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. profiles
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
	id                uuid        primary key references auth.users (id) on delete cascade,
	display_name      text,
	is_instance_owner boolean     not null default false,
	-- FK to spaces(id) is added in Part 2, once spaces exists.
	personal_space_id uuid,
	created_at        timestamptz not null default now()
);

-- At most one instance owner. A unique index over a constant expression,
-- restricted to owner rows, admits one row and rejects the second.
create unique index if not exists profiles_single_instance_owner
	on public.profiles ((true))
	where is_instance_owner;

-- Reads profiles without RLS so a policy on profiles can ask "is the caller
-- the instance owner" without recursing into itself.
create or replace function app.is_instance_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select p.is_instance_owner from public.profiles p where p.id = auth.uid()),
		false
	)
$$;

revoke all on function app.is_instance_owner() from public;
grant execute on function app.is_instance_owner() to authenticated, service_role;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
	on public.profiles
	for select
	to authenticated
	using (id = auth.uid());

drop policy if exists profiles_select_instance_owner on public.profiles;
create policy profiles_select_instance_owner
	on public.profiles
	for select
	to authenticated
	using (app.is_instance_owner());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
	on public.profiles
	for update
	to authenticated
	using (id = auth.uid())
	with check (id = auth.uid());

-- No insert or delete for authenticated: the trigger below inserts, and
-- auth.users' cascade deletes. Column-level update keeps is_instance_owner
-- and personal_space_id out of reach.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------
-- 4. Profile on auth user creation
-- ---------------------------------------------------------------------

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.profiles (id, display_name)
	values (
		new.id,
		coalesce(
			nullif(new.raw_user_meta_data ->> 'display_name', ''),
			nullif(split_part(coalesce(new.email, ''), '@', 1), '')
		)
	)
	on conflict (id) do nothing;
	return new;
end
$$;

revoke all on function app.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function app.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 5. The caller's own sessions
-- ---------------------------------------------------------------------

create or replace function public.my_sessions()
returns table (
	id           uuid,
	created_at   timestamptz,
	updated_at   timestamptz,
	refreshed_at timestamptz,
	user_agent   text,
	ip           text,
	aal          text,
	not_after    timestamptz,
	is_current   boolean
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		s.id,
		s.created_at,
		s.updated_at,
		s.refreshed_at,
		s.user_agent,
		host(s.ip),
		s.aal::text,
		s.not_after,
		s.id::text = (
			nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id'
		)
	from auth.sessions s
	where s.user_id = auth.uid()
	order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc
$$;

revoke all on function public.my_sessions() from public;
grant execute on function public.my_sessions() to authenticated;
