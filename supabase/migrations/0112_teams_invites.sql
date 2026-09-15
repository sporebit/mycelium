-- Migration: invites, invite-only sign-up, and the operations on teams,
-- membership and grants. P12 Part 4.
--
-- The access tables (teams, team_members, team_member_sections, user_grants
-- and now invites) are readable by their parties and writable by nobody
-- through PostgREST directly: every change goes through one of the
-- SECURITY DEFINER functions below, which check the caller's role and keep
-- the invariants (one owner, owner leaves only to a named successor,
-- finance never shared, an invite is single-use and expires in 7 days).
-- Putting the rules in the database means the API routes, the UI and the
-- tests all hit the same wall, and the instance owner's powers are exactly
-- the ones listed here.
--
-- Invite-only: a BEFORE INSERT trigger on auth.users refuses any new user
-- whose email has no live invite, except Phil and except when the session
-- has set app.allow_uninvited (tests and seeds). GoTrue sign-up, magic link
-- and Google all pass through it, so there is no code path that creates an
-- account without an invite.
--
-- Depends on: 0110 (access tables, app.role_allows), 0103 (spaces, teams).
-- Rollback: drop the functions listed at the bottom; drop trigger
--   enforce_invite_only on auth.users; drop table invites; drop policy
--   profiles_select_related.

-- ---------------------------------------------------------------------
-- 1. invites
-- ---------------------------------------------------------------------

create table if not exists public.invites (
	id          uuid        primary key default gen_random_uuid(),
	email       text        not null,
	team_id     uuid        references public.teams (id) on delete cascade,
	role        text        not null check (role in ('admin', 'member', 'viewer')),
	token_hash  text        not null unique,
	expires_at  timestamptz not null,
	accepted_at timestamptz,
	accepted_by uuid        references auth.users (id) on delete set null,
	invited_by  uuid        not null references auth.users (id) on delete cascade,
	created_at  timestamptz not null default now(),
	constraint invites_email_shape check (email = lower(email) and position('@' in email) > 1)
);

create index if not exists invites_email_live_idx on public.invites (email) where accepted_at is null;
create index if not exists invites_team_idx on public.invites (team_id);

alter table public.invites enable row level security;

-- The inviter, the team's owner/admins, and (once accepted) the acceptee.
drop policy if exists invites_select_party on public.invites;
create policy invites_select_party
	on public.invites for select to authenticated
	using (
		invited_by = auth.uid()
		or accepted_by = auth.uid()
		or (team_id is not null and exists (
			select 1 from public.team_members tm
			where tm.team_id = invites.team_id and tm.user_id = auth.uid() and tm.role in ('owner', 'admin')))
	);

grant select on public.invites to authenticated;
grant all on public.invites to service_role;

-- ---------------------------------------------------------------------
-- 2. Invite-only sign-up
-- ---------------------------------------------------------------------

create or replace function app.enforce_invite_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.id = app.legacy_user_uid('phil') then return new; end if;
	if current_setting('app.allow_uninvited', true) = 'on' then return new; end if;
	if new.email is not null and exists (
		select 1 from public.invites i
		where i.email = lower(new.email) and i.accepted_at is null and i.expires_at > now()
	) then
		return new;
	end if;
	raise exception using
		errcode = 'P0001',
		message = 'Sign-up is by invitation only',
		hint = 'No live invite exists for this email address';
end
$$;

revoke all on function app.enforce_invite_only() from public;

drop trigger if exists enforce_invite_only on auth.users;
create trigger enforce_invite_only
	before insert on auth.users
	for each row execute function app.enforce_invite_only();

-- ---------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------

create or replace function app.team_role(p_team uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select tm.role from public.team_members tm where tm.team_id = p_team and tm.user_id = p_user
$$;

revoke all on function app.team_role(uuid, uuid) from public;
grant execute on function app.team_role(uuid, uuid) to authenticated, service_role;

-- Teammates and grant parties may see each other's profile (names only).
create or replace function app.is_related(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select p_other = auth.uid()
		or exists (
			select 1 from public.team_members a
			join public.team_members b on b.team_id = a.team_id
			where a.user_id = auth.uid() and b.user_id = p_other)
		or exists (
			select 1 from public.user_grants g
			where g.revoked_at is null
			  and ((g.grantor_id = auth.uid() and g.grantee_id = p_other)
			    or (g.grantee_id = auth.uid() and g.grantor_id = p_other)))
$$;

revoke all on function app.is_related(uuid) from public;
grant execute on function app.is_related(uuid) to authenticated, service_role;

drop policy if exists profiles_select_related on public.profiles;
create policy profiles_select_related
	on public.profiles for select to authenticated
	using (app.is_related(id));

-- Sections a new user sees first: Organisation, Fitness, Health. The
-- rest is hidden in ui_prefs until they turn it on.
create or replace function app.default_hidden_sections()
returns jsonb
language sql
immutable
as $$
	select '["finance", "studio", "ventures", "drops", "the-boys"]'::jsonb
$$;

-- ---------------------------------------------------------------------
-- 4. Teams
-- ---------------------------------------------------------------------

create or replace function public.create_team(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_me    uuid := auth.uid();
	v_team  uuid;
	v_space uuid;
begin
	if v_me is null then raise exception 'Not signed in'; end if;
	if p_name is null or length(trim(p_name)) = 0 then raise exception 'Team name is required'; end if;

	insert into public.teams (name, slug, owner_user_id)
	values (trim(p_name), lower(p_slug), v_me)
	returning id into v_team;

	insert into public.spaces (kind, team_id) values ('team', v_team) returning id into v_space;
	update public.teams set space_id = v_space where id = v_team;

	insert into public.team_members (team_id, user_id, role) values (v_team, v_me, 'owner');
	return v_team;
end
$$;

create or replace function public.rename_team(p_team uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if app.team_role(p_team, auth.uid()) not in ('owner', 'admin') then
		raise exception 'Only the team owner or an admin can rename the team';
	end if;
	update public.teams set name = trim(p_name) where id = p_team;
end
$$;

-- Role changes. Owner may set admin/member/viewer on anyone but the owner;
-- admin may set member/viewer on members and viewers. Ownership moves only
-- through transfer_team_ownership.
create or replace function public.set_team_member_role(p_team uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_mine   text := app.team_role(p_team, auth.uid());
	v_theirs text := app.team_role(p_team, p_user);
begin
	if p_role not in ('admin', 'member', 'viewer') then raise exception 'Role must be admin, member or viewer'; end if;
	if v_theirs is null then raise exception 'Not a member of this team'; end if;
	if v_theirs = 'owner' then raise exception 'Use transfer_team_ownership to change the owner'; end if;
	if v_mine = 'owner' then
		null;
	elsif v_mine = 'admin' and v_theirs in ('member', 'viewer') and p_role in ('member', 'viewer') then
		null;
	else
		raise exception 'Not allowed to change this member''s role';
	end if;
	update public.team_members set role = p_role where team_id = p_team and user_id = p_user;
end
$$;

-- Section toggles narrow a member; the owner cannot be narrowed.
create or replace function public.set_team_member_sections(
	p_team uuid, p_user uuid, p_section text,
	p_can_view boolean, p_can_edit boolean, p_can_create_delete boolean, p_can_share boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_mine   text := app.team_role(p_team, auth.uid());
	v_theirs text := app.team_role(p_team, p_user);
begin
	if v_mine not in ('owner', 'admin') then raise exception 'Only the team owner or an admin can set section access'; end if;
	if v_theirs is null then raise exception 'Not a member of this team'; end if;
	if v_theirs = 'owner' then raise exception 'The owner''s access cannot be narrowed'; end if;
	if v_mine = 'admin' and v_theirs = 'admin' then raise exception 'An admin cannot narrow another admin'; end if;

	insert into public.team_member_sections (team_id, user_id, section, can_view, can_edit, can_create_delete, can_share)
	values (p_team, p_user, p_section, p_can_view, p_can_edit, p_can_create_delete, p_can_share)
	on conflict (team_id, user_id, section) do update
		set can_view = excluded.can_view, can_edit = excluded.can_edit,
		    can_create_delete = excluded.can_create_delete, can_share = excluded.can_share;
end
$$;

-- Removal. Contributions stay with the team: rows keep their space_id and
-- created_by; only the membership row goes.
create or replace function public.remove_team_member(p_team uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_mine   text := app.team_role(p_team, auth.uid());
	v_theirs text := app.team_role(p_team, p_user);
begin
	if p_user = auth.uid() then raise exception 'Use leave_team to leave'; end if;
	if v_theirs is null then raise exception 'Not a member of this team'; end if;
	if v_theirs = 'owner' then raise exception 'The owner cannot be removed'; end if;
	if v_mine = 'owner' or (v_mine = 'admin' and v_theirs in ('member', 'viewer')) then
		delete from public.team_members where team_id = p_team and user_id = p_user;
		update public.teams set successor_user_id = null where id = p_team and successor_user_id = p_user;
	else
		raise exception 'Not allowed to remove this member';
	end if;
end
$$;

create or replace function public.set_team_successor(p_team uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if app.team_role(p_team, auth.uid()) <> 'owner' then raise exception 'Only the owner names a successor'; end if;
	if p_user is not null and app.team_role(p_team, p_user) is null then raise exception 'The successor must be a member'; end if;
	if p_user = auth.uid() then raise exception 'The successor must be someone else'; end if;
	update public.teams set successor_user_id = p_user where id = p_team;
end
$$;

-- Ownership transfer: by the owner, or by the instance owner when the
-- current owner has vanished (no profile) — the "owner vanishes" case.
create or replace function public.transfer_team_ownership(p_team uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_owner uuid;
begin
	select owner_user_id into v_owner from public.teams where id = p_team;
	if v_owner is null then raise exception 'No such team'; end if;
	if app.team_role(p_team, p_new_owner) is null then raise exception 'The new owner must be a member'; end if;
	if p_new_owner = v_owner then return; end if;

	if auth.uid() = v_owner then
		null;
	elsif app.is_instance_owner() and not exists (select 1 from public.profiles where id = v_owner) then
		null;
	else
		raise exception 'Only the owner (or the instance owner, when the owner is gone) can transfer ownership';
	end if;

	update public.team_members set role = 'admin' where team_id = p_team and user_id = v_owner;
	update public.team_members set role = 'owner' where team_id = p_team and user_id = p_new_owner;
	update public.teams
		set owner_user_id = p_new_owner,
		    successor_user_id = case when successor_user_id = p_new_owner then null else successor_user_id end
		where id = p_team;
end
$$;

-- Instance owner appoints a successor for a team whose owner is gone, and
-- ownership moves at once. Audited from Part 5.
create or replace function public.appoint_team_successor(p_team uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_owner uuid;
begin
	if not app.is_instance_owner() then raise exception 'Instance owner only'; end if;
	select owner_user_id into v_owner from public.teams where id = p_team;
	if v_owner is null then raise exception 'No such team'; end if;
	if exists (select 1 from public.profiles where id = v_owner) then
		raise exception 'The owner is still present; only they can name a successor';
	end if;
	update public.teams set successor_user_id = p_user where id = p_team;
	perform public.transfer_team_ownership(p_team, p_user);
end
$$;

-- Leaving. An owner leaves only to a named successor who is still a member.
create or replace function public.leave_team(p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_me   uuid := auth.uid();
	v_role text := app.team_role(p_team, v_me);
	v_succ uuid;
begin
	if v_role is null then raise exception 'Not a member of this team'; end if;
	if v_role = 'owner' then
		select successor_user_id into v_succ from public.teams where id = p_team;
		if v_succ is null or app.team_role(p_team, v_succ) is null then
			raise exception 'Name a successor who is a member before leaving';
		end if;
		perform public.transfer_team_ownership(p_team, v_succ);
	end if;
	delete from public.team_members where team_id = p_team and user_id = v_me;
	update public.teams set successor_user_id = null where id = p_team and successor_user_id = v_me;
end
$$;

-- ---------------------------------------------------------------------
-- 5. Direct grants
-- ---------------------------------------------------------------------

create or replace function public.create_user_grant(
	p_grantee uuid, p_section text, p_entity_groups text[], p_verbs text[],
	p_expires_at timestamptz default null, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id uuid;
begin
	if auth.uid() is null then raise exception 'Not signed in'; end if;
	if not exists (select 1 from public.profiles where id = p_grantee) then raise exception 'No such user'; end if;
	insert into public.user_grants (grantor_id, grantee_id, section, entity_groups, verbs, expires_at, reason)
	values (auth.uid(), p_grantee, p_section, coalesce(p_entity_groups, '{}'), p_verbs, p_expires_at, p_reason)
	returning id into v_id;
	return v_id;
end
$$;

-- Either party ends a grant: the grantor revokes, the grantee declines.
create or replace function public.revoke_user_grant(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.user_grants
		set revoked_at = now()
		where id = p_id and revoked_at is null and (grantor_id = auth.uid() or grantee_id = auth.uid());
	if not found then raise exception 'No such active grant'; end if;
end
$$;

create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
	select p.id, p.display_name
	from public.profiles p
	join auth.users u on u.id = p.id
	where auth.uid() is not null and lower(u.email) = lower(trim(p_email))
	limit 1
$$;

-- ---------------------------------------------------------------------
-- 6. Invites
-- ---------------------------------------------------------------------

-- Returns the plaintext token exactly once; only its sha256 is stored.
create or replace function public.create_invite(p_email text, p_team uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_me    uuid := auth.uid();
	v_mine  text;
	v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
	if v_me is null then raise exception 'Not signed in'; end if;
	if p_team is null then
		if not app.is_instance_owner() then raise exception 'Only the instance owner invites without a team'; end if;
	else
		v_mine := app.team_role(p_team, v_me);
		if v_mine = 'owner' then
			null;
		elsif v_mine = 'admin' and p_role in ('member', 'viewer') then
			null;
		else
			raise exception 'Only the owner (any role) or an admin (member/viewer) can invite';
		end if;
	end if;

	insert into public.invites (email, team_id, role, token_hash, expires_at, invited_by)
	values (lower(trim(p_email)), p_team, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days', v_me);
	return v_token;
end
$$;

-- What the /invite/[token] page shows before the person has an account.
create or replace function public.invite_preview(p_token text)
returns table (email text, team_id uuid, team_name text, role text, invited_by_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
	select i.email, i.team_id, t.name, i.role, p.display_name,
		case
			when i.accepted_at is not null then 'accepted'
			when i.expires_at <= now()     then 'expired'
			else 'valid'
		end
	from public.invites i
	left join public.teams t on t.id = i.team_id
	left join public.profiles p on p.id = i.invited_by
	where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

-- After the invitee has signed in (their auth user exists only from that
-- moment): join the team, seed their first-screen settings, spend the token.
create or replace function public.accept_invite(p_token text)
returns table (team_id uuid, team_slug text, role text, requires_totp boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
	v_me    uuid := auth.uid();
	v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
	v_inv   public.invites%rowtype;
	v_space uuid;
	v_slug  text;
begin
	if v_me is null then raise exception 'Not signed in'; end if;
	select * into v_inv from public.invites i
		where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
		for update;
	if v_inv.id is null then raise exception 'No such invite'; end if;
	if v_inv.accepted_at is not null then raise exception 'This invite has already been used'; end if;
	if v_inv.expires_at <= now() then raise exception 'This invite has expired'; end if;
	if v_inv.email <> v_email then raise exception 'This invite was sent to a different email address'; end if;

	if v_inv.team_id is not null then
		insert into public.team_members (team_id, user_id, role)
		values (v_inv.team_id, v_me, v_inv.role)
		on conflict (team_id, user_id) do update set role = excluded.role;
		select slug into v_slug from public.teams where id = v_inv.team_id;
	end if;

	update public.invites set accepted_at = now(), accepted_by = v_me where id = v_inv.id;

	-- First screen: Organisation, Fitness, Health. AI features are off by
	-- column default (0111).
	select personal_space_id into v_space from public.profiles where id = v_me;
	if v_space is not null and not exists (select 1 from public.user_settings s where s.space_id = v_space) then
		insert into public.user_settings (space_id, created_by, display_name, ui_prefs)
		select v_space, v_me, p.display_name, jsonb_build_object('hidden_sections', app.default_hidden_sections())
		from public.profiles p where p.id = v_me;
	end if;

	return query select v_inv.team_id, v_slug, v_inv.role, public.requires_totp();
end
$$;

-- TOTP is mandatory for the instance owner and every team owner or admin.
create or replace function public.requires_totp()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select app.is_instance_owner()
		or exists (select 1 from public.team_members tm where tm.user_id = auth.uid() and tm.role in ('owner', 'admin'))
$$;

-- ---------------------------------------------------------------------
-- 7. Grants on the functions
-- ---------------------------------------------------------------------

do $$
declare f text;
begin
	foreach f in array array[
		'public.create_team(text, text)',
		'public.rename_team(uuid, text)',
		'public.set_team_member_role(uuid, uuid, text)',
		'public.set_team_member_sections(uuid, uuid, text, boolean, boolean, boolean, boolean)',
		'public.remove_team_member(uuid, uuid)',
		'public.set_team_successor(uuid, uuid)',
		'public.transfer_team_ownership(uuid, uuid)',
		'public.appoint_team_successor(uuid, uuid)',
		'public.leave_team(uuid)',
		'public.create_user_grant(uuid, text, text[], text[], timestamptz, text)',
		'public.revoke_user_grant(uuid)',
		'public.find_user_by_email(text)',
		'public.create_invite(text, uuid, text)',
		'public.accept_invite(text)',
		'public.requires_totp()'
	] loop
		execute format('revoke all on function %s from public', f);
		execute format('grant execute on function %s to authenticated, service_role', f);
	end loop;
end
$$;

-- The preview is what an anonymous visitor with the link sees.
revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated, service_role;
