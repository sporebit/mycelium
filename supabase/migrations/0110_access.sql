-- Migration: team membership, per-member section toggles, direct grants,
-- and app.accessible_spaces() — the one function every policy asks.
-- P12 Part 3.
--
-- Model (decisions in the P12 prompt):
--   * Every row has a space_id. A user's personal space is theirs alone; a
--     team space is reachable through membership; another user's personal
--     space is reachable through a direct grant.
--   * Verbs: view, edit, create_delete, share.
--   * Roles per team: owner (exactly one), admin, member, viewer.
--       owner   every verb, every section
--       admin   view, edit, create_delete, share — every section
--       member  view, edit, create_delete in enabled sections
--       viewer  view in enabled sections
--     A team_member_sections row can only NARROW a role: with no row the
--     role's default applies; with a row each can_* is ANDed with it. Owner
--     ignores toggles.
--   * Direct grants: grantor → grantee, one section, a list of entity
--     groups (empty = the whole section), a list of verbs, optional expiry,
--     revocable. They resolve through the SAME function as membership.
--   * Finance can never be shared: a check constraint on user_grants and
--     policies that never call the helper (0111). The same treatment is
--     given to `platform` — user_settings carries OAuth tokens and push
--     subscriptions are per device — which the prompt did not list; see the
--     handoff for the reasoning. Both are hard-excluded here as well.
--
-- app.accessible_spaces(entity_group, verb) returns the set of space ids
-- the caller may act on for that group and verb. STABLE + SECURITY DEFINER:
-- it reads the access tables without their own RLS getting in the way, and
-- Postgres evaluates it once per statement, not per row.
--
-- Depends on: 0103 (spaces, teams, entity_groups, app.personal_space).
-- Rollback:
--   drop function if exists app.visible_spaces();
--   drop function if exists app.accessible_spaces(text, text);
--   drop function if exists app.role_allows(text, text);
--   drop table if exists public.user_grants;
--   drop table if exists public.team_member_sections;
--   drop table if exists public.team_members;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.team_members (
	team_id   uuid        not null references public.teams (id) on delete cascade,
	user_id   uuid        not null references auth.users (id) on delete cascade,
	role      text        not null check (role in ('owner', 'admin', 'member', 'viewer')),
	joined_at timestamptz not null default now(),
	primary key (team_id, user_id)
);

-- Exactly one owner per team.
create unique index if not exists team_members_one_owner
	on public.team_members (team_id) where role = 'owner';
create index if not exists team_members_user_idx on public.team_members (user_id);

create table if not exists public.team_member_sections (
	team_id           uuid    not null,
	user_id           uuid    not null,
	section           text    not null check (section in (
		'organisation', 'fitness', 'health', 'studio', 'drops',
		'ventures', 'journal', 'places', 'reminders', 'media')),
	can_view          boolean not null default true,
	can_edit          boolean not null default true,
	can_create_delete boolean not null default true,
	can_share         boolean not null default true,
	primary key (team_id, user_id, section),
	foreign key (team_id, user_id) references public.team_members (team_id, user_id) on delete cascade
);

create table if not exists public.user_grants (
	id            uuid        primary key default gen_random_uuid(),
	grantor_id    uuid        not null references auth.users (id) on delete cascade,
	grantee_id    uuid        not null references auth.users (id) on delete cascade,
	section       text        not null,
	-- Entity groups within the section ('tasks', 'people', …). Empty = all.
	entity_groups text[]      not null default '{}',
	verbs         text[]      not null,
	expires_at    timestamptz,
	revoked_at    timestamptz,
	reason        text,
	created_at    timestamptz not null default now(),
	constraint user_grants_not_self       check (grantor_id <> grantee_id),
	constraint user_grants_section_shape  check (section in (
		'organisation', 'fitness', 'health', 'studio', 'drops',
		'ventures', 'journal', 'places', 'reminders', 'media')),
	constraint user_grants_never_finance  check (section <> 'finance'),
	constraint user_grants_never_platform check (section <> 'platform'),
	constraint user_grants_verbs_shape    check (
		cardinality(verbs) > 0 and verbs <@ array['view', 'edit', 'create_delete', 'share']::text[])
);

create index if not exists user_grants_grantee_idx on public.user_grants (grantee_id) where revoked_at is null;
create index if not exists user_grants_grantor_idx on public.user_grants (grantor_id) where revoked_at is null;

-- ---------------------------------------------------------------------
-- 2. Functions
-- ---------------------------------------------------------------------

create or replace function app.role_allows(p_role text, p_verb text)
returns boolean
language sql
immutable
parallel safe
as $$
	select case p_role
		when 'owner'  then true
		when 'admin'  then p_verb in ('view', 'edit', 'create_delete', 'share')
		when 'member' then p_verb in ('view', 'edit', 'create_delete')
		when 'viewer' then p_verb = 'view'
		else false
	end
$$;

-- p_entity_group is 'section.group', e.g. 'organisation.tasks'.
create or replace function app.accessible_spaces(p_entity_group text, p_verb text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
	with me as (
		select auth.uid() as uid
	),
	target as (
		select split_part(p_entity_group, '.', 1) as section,
		       split_part(p_entity_group, '.', 2) as grp
	)
	-- 1. The caller's own personal space, every group, every verb.
	select p.personal_space_id
	from public.profiles p, me
	where p.id = me.uid and p.personal_space_id is not null

	union

	-- 2. Team spaces by membership, narrowed by section toggles.
	select t.space_id
	from public.teams t
	join public.team_members tm on tm.team_id = t.id
	join me on tm.user_id = me.uid
	cross join target
	left join public.team_member_sections s
	       on s.team_id = tm.team_id and s.user_id = tm.user_id and s.section = target.section
	where t.space_id is not null
	  and target.section not in ('finance', 'platform')
	  and app.role_allows(tm.role, p_verb)
	  and (
		tm.role = 'owner'
		or coalesce(
			case p_verb
				when 'view'          then s.can_view
				when 'edit'          then s.can_edit
				when 'create_delete' then s.can_create_delete
				when 'share'         then s.can_share
			end,
			true)
	  )

	union

	-- 3. Grantors' personal spaces by direct grant.
	select gp.personal_space_id
	from public.user_grants ug
	join me on ug.grantee_id = me.uid
	join public.profiles gp on gp.id = ug.grantor_id
	cross join target
	where gp.personal_space_id is not null
	  and ug.section = target.section
	  and ug.section not in ('finance', 'platform')
	  and (cardinality(ug.entity_groups) = 0 or target.grp = any (ug.entity_groups))
	  and p_verb = any (ug.verbs)
	  and ug.revoked_at is null
	  and (ug.expires_at is null or ug.expires_at > now())
$$;

revoke all on function app.role_allows(text, text) from public;
revoke all on function app.accessible_spaces(text, text) from public;
grant execute on function app.role_allows(text, text) to authenticated, service_role;
grant execute on function app.accessible_spaces(text, text) to authenticated, service_role;

-- Every space the caller can see at all (for the spaces/teams policies and
-- the UI's space picker): own personal space, member team spaces, and the
-- personal spaces of anyone with an active grant to them.
create or replace function app.visible_spaces()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
	select p.personal_space_id from public.profiles p
	where p.id = auth.uid() and p.personal_space_id is not null
	union
	select t.space_id from public.teams t
	join public.team_members tm on tm.team_id = t.id and tm.user_id = auth.uid()
	where t.space_id is not null
	union
	select gp.personal_space_id from public.user_grants ug
	join public.profiles gp on gp.id = ug.grantor_id
	where ug.grantee_id = auth.uid() and ug.revoked_at is null
	  and (ug.expires_at is null or ug.expires_at > now())
	  and gp.personal_space_id is not null
$$;

revoke all on function app.visible_spaces() from public;
grant execute on function app.visible_spaces() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Policies on the access tables themselves
-- ---------------------------------------------------------------------

alter table public.team_members         enable row level security;
alter table public.team_member_sections enable row level security;
alter table public.user_grants          enable row level security;

-- A member sees the membership of teams they belong to (Part 4's UI needs
-- the roster). Writes are Part 4's, through the 0112 functions.
--
-- The check is a SECURITY DEFINER function rather than a subquery on
-- team_members: a policy on a table that selects from the same table is
-- rejected by Postgres as infinite recursion.
create or replace function app.is_team_member(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.team_members tm
		where tm.team_id = p_team and tm.user_id = auth.uid())
$$;

revoke all on function app.is_team_member(uuid) from public;
grant execute on function app.is_team_member(uuid) to authenticated, service_role;

drop policy if exists team_members_select_member on public.team_members;
create policy team_members_select_member
	on public.team_members for select to authenticated
	using (app.is_team_member(team_id));

drop policy if exists team_member_sections_select_member on public.team_member_sections;
create policy team_member_sections_select_member
	on public.team_member_sections for select to authenticated
	using (app.is_team_member(team_id));

-- A grant is visible to both ends of it.
drop policy if exists user_grants_select_party on public.user_grants;
create policy user_grants_select_party
	on public.user_grants for select to authenticated
	using (grantor_id = auth.uid() or grantee_id = auth.uid());

grant select on public.team_members, public.team_member_sections, public.user_grants to authenticated;
grant all on public.team_members, public.team_member_sections, public.user_grants to service_role;

-- spaces / teams: widen from "own personal space" to everything visible.
drop policy if exists spaces_select_own on public.spaces;
drop policy if exists spaces_select_visible on public.spaces;
create policy spaces_select_visible
	on public.spaces for select to authenticated
	using (id in (select app.visible_spaces()));

drop policy if exists teams_select_owner on public.teams;
drop policy if exists teams_select_member on public.teams;
create policy teams_select_member
	on public.teams for select to authenticated
	using (owner_user_id = auth.uid() or app.is_team_member(id));
