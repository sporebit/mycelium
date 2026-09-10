-- Migration: audit events, disabled users, remote sign-out, account
-- deletion, and the instance owner's admin reads. P12 Part 5.
--
-- audit_events is append-only. Rows come from three places:
--   1. Triggers on the auth and access tables: sign-in/out (auth.sessions),
--      MFA changes (auth.mfa_factors), invites, membership and roles,
--      section toggles, successor and ownership changes, grants. These
--      fire no matter which code path made the change.
--   2. app.audit(...) called by the functions below (disable user, delete
--      account, session revoked).
--   3. lib/system/audit.ts (service role) for what only the API layer
--      knows: break-glass requests, cross-user reads, exports.
-- Nothing else can insert; nobody can update or delete. A user reads the
-- rows where they are the actor or the subject; the instance owner reads
-- everything through admin_audit(). actor_id has no FK so history survives
-- a deleted account.
--
-- Disabled users: profiles.disabled_at. app.personal_space() returns null
-- for a disabled user, so every policy (personal, team, grant) yields
-- nothing; auth.users.banned_until stops new sign-ins. The instance owner
-- may then appoint a successor for any team they owned.
--
-- Deletion: public.delete_my_account() (self) and admin_delete_user()
-- (instance owner). Personal spaces cascade to their rows; memberships,
-- grants and invites go; the auth user is deleted, which sets created_by
-- to null on rows that stay with a team (FK on delete set null).
--
-- Depends on: 0112.
-- Rollback: drop the triggers and functions listed below; drop table
--   audit_events; alter table profiles drop column disabled_at.

-- ---------------------------------------------------------------------
-- 1. audit_events
-- ---------------------------------------------------------------------

create table if not exists public.audit_events (
	id              bigint      generated always as identity primary key,
	at              timestamptz not null default now(),
	actor_id        uuid,
	principal       text        not null check (principal in ('user', 'system', 'break_glass')),
	action          text        not null,
	section         text,
	entity_group    text,
	entity_id       text,
	subject_user_id uuid,
	space_id        uuid,
	team_id         uuid,
	ip              text,
	user_agent      text,
	meta            jsonb       not null default '{}'::jsonb
);

create index if not exists audit_events_at_idx      on public.audit_events (at desc);
create index if not exists audit_events_actor_idx   on public.audit_events (actor_id, at desc);
create index if not exists audit_events_subject_idx on public.audit_events (subject_user_id, at desc) where subject_user_id is not null;
create index if not exists audit_events_team_idx    on public.audit_events (team_id, at desc) where team_id is not null;
create index if not exists audit_events_action_idx  on public.audit_events (action, at desc);

alter table public.audit_events enable row level security;

drop policy if exists audit_events_select_party on public.audit_events;
create policy audit_events_select_party
	on public.audit_events for select to authenticated
	using (actor_id = auth.uid() or subject_user_id = auth.uid());

grant select on public.audit_events to authenticated;
grant select, insert on public.audit_events to service_role;

-- The request's principal and path, when the API layer set them (0113's
-- createUserClient passes x-principal / x-principal-path through as GUCs
-- is not possible over PostgREST; instead the JWT tells us user vs system
-- and the API layer writes break-glass rows itself).
create or replace function app.request_ip()
returns text
language sql
stable
as $$
	select nullif(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '')
$$;

create or replace function app.request_user_agent()
returns text
language sql
stable
as $$
	select nullif(current_setting('request.headers', true)::json ->> 'user-agent', '')
$$;

create or replace function app.audit(
	p_action          text,
	p_section         text default null,
	p_entity_group    text default null,
	p_entity_id       text default null,
	p_subject_user_id uuid default null,
	p_space_id        uuid default null,
	p_team_id         uuid default null,
	p_meta            jsonb default '{}'::jsonb,
	p_actor           uuid default null,
	p_principal       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_actor uuid := coalesce(p_actor, auth.uid());
begin
	insert into public.audit_events (actor_id, principal, action, section, entity_group, entity_id, subject_user_id, space_id, team_id, ip, user_agent, meta)
	values (
		v_actor,
		coalesce(p_principal, case when v_actor is null then 'system' else 'user' end),
		p_action, p_section, p_entity_group, p_entity_id, p_subject_user_id, p_space_id, p_team_id,
		app.request_ip(), app.request_user_agent(), coalesce(p_meta, '{}'::jsonb)
	);
end
$$;

revoke all on function app.audit(text, text, text, text, uuid, uuid, uuid, jsonb, uuid, text) from public;
grant execute on function app.audit(text, text, text, text, uuid, uuid, uuid, jsonb, uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 2. Triggers that write audit rows
-- ---------------------------------------------------------------------

create or replace function app.audit_auth_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		perform app.audit('sign_in', p_actor => new.user_id, p_subject_user_id => new.user_id,
			p_meta => jsonb_build_object('session_id', new.id, 'aal', new.aal::text));
		return new;
	elsif tg_op = 'DELETE' then
		perform app.audit('sign_out', p_actor => old.user_id, p_subject_user_id => old.user_id,
			p_meta => jsonb_build_object('session_id', old.id));
		return old;
	end if;
	return null;
end
$$;

drop trigger if exists audit_auth_sessions on auth.sessions;
create trigger audit_auth_sessions
	after insert or delete on auth.sessions
	for each row execute function app.audit_auth_sessions();

create or replace function app.audit_mfa_factors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		perform app.audit('mfa_enrol_started', p_actor => new.user_id, p_subject_user_id => new.user_id,
			p_meta => jsonb_build_object('factor_id', new.id, 'type', new.factor_type::text));
		return new;
	elsif tg_op = 'UPDATE' then
		if old.status::text <> 'verified' and new.status::text = 'verified' then
			perform app.audit('mfa_enrolled', p_actor => new.user_id, p_subject_user_id => new.user_id,
				p_meta => jsonb_build_object('factor_id', new.id, 'type', new.factor_type::text));
		end if;
		return new;
	elsif tg_op = 'DELETE' then
		perform app.audit('mfa_removed', p_actor => old.user_id, p_subject_user_id => old.user_id,
			p_meta => jsonb_build_object('factor_id', old.id, 'type', old.factor_type::text, 'was_verified', old.status::text = 'verified'));
		return old;
	end if;
	return null;
end
$$;

drop trigger if exists audit_mfa_factors on auth.mfa_factors;
create trigger audit_mfa_factors
	after insert or update or delete on auth.mfa_factors
	for each row execute function app.audit_mfa_factors();

create or replace function app.audit_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		perform app.audit('invite_created', p_team_id => new.team_id, p_entity_id => new.id::text,
			p_actor => new.invited_by, p_meta => jsonb_build_object('email', new.email, 'role', new.role));
	elsif tg_op = 'UPDATE' and old.accepted_at is null and new.accepted_at is not null then
		perform app.audit('invite_accepted', p_team_id => new.team_id, p_entity_id => new.id::text,
			p_actor => new.accepted_by, p_subject_user_id => new.invited_by,
			p_meta => jsonb_build_object('email', new.email, 'role', new.role));
	end if;
	return new;
end
$$;

drop trigger if exists audit_invites on public.invites;
create trigger audit_invites
	after insert or update on public.invites
	for each row execute function app.audit_invites();

create or replace function app.audit_team_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		perform app.audit('member_added', p_team_id => new.team_id, p_subject_user_id => new.user_id,
			p_meta => jsonb_build_object('role', new.role));
		return new;
	elsif tg_op = 'UPDATE' and old.role <> new.role then
		perform app.audit('role_changed', p_team_id => new.team_id, p_subject_user_id => new.user_id,
			p_meta => jsonb_build_object('from', old.role, 'to', new.role));
		return new;
	elsif tg_op = 'DELETE' then
		perform app.audit('member_removed', p_team_id => old.team_id, p_subject_user_id => old.user_id,
			p_meta => jsonb_build_object('role', old.role, 'self', old.user_id = auth.uid()));
		return old;
	end if;
	return coalesce(new, old);
end
$$;

drop trigger if exists audit_team_members on public.team_members;
create trigger audit_team_members
	after insert or update or delete on public.team_members
	for each row execute function app.audit_team_members();

create or replace function app.audit_team_member_sections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform app.audit('sections_changed', p_team_id => new.team_id, p_subject_user_id => new.user_id, p_section => new.section,
		p_meta => jsonb_build_object('can_view', new.can_view, 'can_edit', new.can_edit, 'can_create_delete', new.can_create_delete, 'can_share', new.can_share));
	return new;
end
$$;

drop trigger if exists audit_team_member_sections on public.team_member_sections;
create trigger audit_team_member_sections
	after insert or update on public.team_member_sections
	for each row execute function app.audit_team_member_sections();

create or replace function app.audit_teams()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		perform app.audit('team_created', p_team_id => new.id, p_meta => jsonb_build_object('name', new.name, 'slug', new.slug));
		return new;
	end if;
	if old.owner_user_id is distinct from new.owner_user_id then
		perform app.audit('ownership_transferred', p_team_id => new.id, p_subject_user_id => new.owner_user_id,
			p_meta => jsonb_build_object('from', old.owner_user_id, 'to', new.owner_user_id));
	end if;
	if old.successor_user_id is distinct from new.successor_user_id then
		perform app.audit('successor_changed', p_team_id => new.id, p_subject_user_id => new.successor_user_id,
			p_meta => jsonb_build_object('from', old.successor_user_id, 'to', new.successor_user_id));
	end if;
	return new;
end
$$;

drop trigger if exists audit_teams on public.teams;
create trigger audit_teams
	after insert or update on public.teams
	for each row execute function app.audit_teams();

create or replace function app.audit_user_grants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		perform app.audit('grant_created', p_section => new.section, p_entity_id => new.id::text,
			p_actor => new.grantor_id, p_subject_user_id => new.grantee_id,
			p_meta => jsonb_build_object('entity_groups', to_jsonb(new.entity_groups), 'verbs', to_jsonb(new.verbs), 'expires_at', new.expires_at));
	elsif tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null then
		perform app.audit('grant_revoked', p_section => new.section, p_entity_id => new.id::text,
			p_subject_user_id => case when auth.uid() = new.grantor_id then new.grantee_id else new.grantor_id end,
			p_meta => jsonb_build_object('by_grantee', auth.uid() = new.grantee_id));
	end if;
	return new;
end
$$;

drop trigger if exists audit_user_grants on public.user_grants;
create trigger audit_user_grants
	after insert or update on public.user_grants
	for each row execute function app.audit_user_grants();

-- ---------------------------------------------------------------------
-- 3. Disabled users
-- ---------------------------------------------------------------------

alter table public.profiles add column if not exists disabled_at timestamptz;

-- A disabled user has no personal space as far as policies are concerned,
-- so every policy shape (personal, team via accessible_spaces, grant)
-- returns nothing for them.
create or replace function app.personal_space()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select p.personal_space_id from public.profiles p where p.id = auth.uid() and p.disabled_at is null
$$;

create or replace function app.accessible_spaces(p_entity_group text, p_verb text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
	with me as (
		select p.id as uid from public.profiles p where p.id = auth.uid() and p.disabled_at is null
	),
	target as (
		select split_part(p_entity_group, '.', 1) as section,
		       split_part(p_entity_group, '.', 2) as grp
	)
	select p.personal_space_id
	from public.profiles p join me on p.id = me.uid
	where p.personal_space_id is not null
	union
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
	  and (tm.role = 'owner' or coalesce(
			case p_verb
				when 'view'          then s.can_view
				when 'edit'          then s.can_edit
				when 'create_delete' then s.can_create_delete
				when 'share'         then s.can_share
			end, true))
	union
	select gp.personal_space_id
	from public.user_grants ug
	join me on ug.grantee_id = me.uid
	join public.profiles gp on gp.id = ug.grantor_id
	cross join target
	where gp.personal_space_id is not null
	  and gp.disabled_at is null
	  and ug.section = target.section
	  and ug.section not in ('finance', 'platform')
	  and (cardinality(ug.entity_groups) = 0 or target.grp = any (ug.entity_groups))
	  and p_verb = any (ug.verbs)
	  and ug.revoked_at is null
	  and (ug.expires_at is null or ug.expires_at > now())
$$;

-- The instance owner may appoint a successor when the owner is gone OR disabled.
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
	if exists (select 1 from public.profiles where id = v_owner and disabled_at is null) then
		raise exception 'The owner is still present; only they can name a successor';
	end if;
	update public.teams set successor_user_id = p_user where id = p_team;
	update public.team_members set role = 'admin' where team_id = p_team and user_id = v_owner;
	update public.team_members set role = 'owner' where team_id = p_team and user_id = p_user;
	update public.teams set owner_user_id = p_user, successor_user_id = null where id = p_team;
	perform app.audit('successor_appointed', p_team_id => p_team, p_subject_user_id => p_user,
		p_meta => jsonb_build_object('previous_owner', v_owner));
end
$$;

-- ---------------------------------------------------------------------
-- 4. Sessions: remote sign-out
-- ---------------------------------------------------------------------

create or replace function public.end_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	delete from auth.sessions where id = p_id and user_id = auth.uid();
	if not found then raise exception 'No such session'; end if;
	perform app.audit('session_revoked', p_meta => jsonb_build_object('session_id', p_id));
end
$$;

-- ---------------------------------------------------------------------
-- 5. Account deletion
-- ---------------------------------------------------------------------

create or replace function app.delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_owned int;
begin
	select count(*) into v_owned from public.teams t where t.owner_user_id = p_user;
	if v_owned > 0 then
		raise exception 'This user still owns % team(s); transfer ownership first', v_owned;
	end if;
	delete from public.team_member_sections where user_id = p_user;
	delete from public.team_members where user_id = p_user;
	delete from public.user_grants where grantor_id = p_user or grantee_id = p_user;
	delete from public.invites where invited_by = p_user or accepted_by = p_user;
	-- Personal space: every row in it cascades from spaces(id).
	delete from public.spaces where kind = 'personal' and owner_user_id = p_user;
	-- The auth user: profiles cascades; created_by on team rows becomes null.
	delete from auth.users where id = p_user;
end
$$;

revoke all on function app.delete_user(uuid) from public;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_me uuid := auth.uid();
begin
	if v_me is null then raise exception 'Not signed in'; end if;
	if app.is_instance_owner() then raise exception 'The instance owner cannot delete their own account'; end if;
	perform app.audit('account_deleted', p_subject_user_id => v_me, p_meta => jsonb_build_object('self', true));
	perform app.delete_user(v_me);
end
$$;

-- ---------------------------------------------------------------------
-- 6. Admin reads and actions (instance owner only; access tables only)
-- ---------------------------------------------------------------------

create or replace function public.admin_users()
returns table (
	id uuid, email text, display_name text, is_instance_owner boolean,
	disabled_at timestamptz, created_at timestamptz, last_sign_in_at timestamptz,
	teams int, grants_given int, grants_received int
)
language sql
stable
security definer
set search_path = ''
as $$
	select p.id, u.email, p.display_name, p.is_instance_owner, p.disabled_at, p.created_at, u.last_sign_in_at,
		(select count(*)::int from public.team_members tm where tm.user_id = p.id),
		(select count(*)::int from public.user_grants g where g.grantor_id = p.id and g.revoked_at is null),
		(select count(*)::int from public.user_grants g where g.grantee_id = p.id and g.revoked_at is null)
	from public.profiles p
	join auth.users u on u.id = p.id
	where app.is_instance_owner()
	order by p.created_at
$$;

create or replace function public.admin_set_user_disabled(p_user uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not app.is_instance_owner() then raise exception 'Instance owner only'; end if;
	if p_user = auth.uid() then raise exception 'You cannot disable yourself'; end if;
	update public.profiles set disabled_at = case when p_disabled then now() else null end where id = p_user;
	update auth.users set banned_until = case when p_disabled then now() + interval '100 years' else null end where id = p_user;
	if p_disabled then delete from auth.sessions where user_id = p_user; end if;
	perform app.audit(case when p_disabled then 'user_disabled' else 'user_enabled' end, p_subject_user_id => p_user);
end
$$;

create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not app.is_instance_owner() then raise exception 'Instance owner only'; end if;
	if p_user = auth.uid() then raise exception 'You cannot delete yourself'; end if;
	perform app.audit('account_deleted', p_subject_user_id => p_user, p_meta => jsonb_build_object('self', false));
	perform app.delete_user(p_user);
end
$$;

create or replace function public.admin_teams()
returns table (id uuid, name text, slug text, owner_user_id uuid, successor_user_id uuid, created_at timestamptz, members int)
language sql
stable
security definer
set search_path = ''
as $$
	select t.id, t.name, t.slug, t.owner_user_id, t.successor_user_id, t.created_at,
		(select count(*)::int from public.team_members tm where tm.team_id = t.id)
	from public.teams t where app.is_instance_owner() order by t.created_at
$$;

create or replace function public.admin_memberships()
returns table (team_id uuid, user_id uuid, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
	select tm.team_id, tm.user_id, tm.role, tm.joined_at from public.team_members tm where app.is_instance_owner()
$$;

create or replace function public.admin_grants()
returns table (id uuid, grantor_id uuid, grantee_id uuid, section text, entity_groups text[], verbs text[], expires_at timestamptz, revoked_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
	select g.id, g.grantor_id, g.grantee_id, g.section, g.entity_groups, g.verbs, g.expires_at, g.revoked_at, g.created_at
	from public.user_grants g where app.is_instance_owner() order by g.created_at desc
$$;

create or replace function public.admin_invites()
returns table (id uuid, email text, team_id uuid, role text, expires_at timestamptz, accepted_at timestamptz, invited_by uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
	select i.id, i.email, i.team_id, i.role, i.expires_at, i.accepted_at, i.invited_by, i.created_at
	from public.invites i where app.is_instance_owner() order by i.created_at desc
$$;

create or replace function public.admin_audit(
	p_actor uuid default null, p_subject uuid default null, p_team uuid default null,
	p_section text default null, p_action text default null,
	p_from timestamptz default null, p_to timestamptz default null,
	p_limit int default 200
)
returns setof public.audit_events
language sql
stable
security definer
set search_path = ''
as $$
	select e.* from public.audit_events e
	where app.is_instance_owner()
	  and (p_actor   is null or e.actor_id = p_actor)
	  and (p_subject is null or e.subject_user_id = p_subject)
	  and (p_team    is null or e.team_id = p_team)
	  and (p_section is null or e.section = p_section)
	  and (p_action  is null or e.action = p_action)
	  and (p_from    is null or e.at >= p_from)
	  and (p_to      is null or e.at <= p_to)
	order by e.at desc
	limit least(greatest(p_limit, 1), 1000)
$$;

do $$
declare f text;
begin
	foreach f in array array[
		'public.end_session(uuid)',
		'public.delete_my_account()',
		'public.admin_users()',
		'public.admin_set_user_disabled(uuid, boolean)',
		'public.admin_delete_user(uuid)',
		'public.admin_teams()',
		'public.admin_memberships()',
		'public.admin_grants()',
		'public.admin_invites()',
		'public.admin_audit(uuid, uuid, uuid, text, text, timestamptz, timestamptz, int)'
	] loop
		execute format('revoke all on function %s from public', f);
		execute format('grant execute on function %s to authenticated, service_role', f);
	end loop;
end
$$;

-- The caller's personal space id, for the API layer's read audit.
create or replace function public.my_personal_space()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select app.personal_space()
$$;

revoke all on function public.my_personal_space() from public;
grant execute on function public.my_personal_space() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Feature flags (P12 open item A) — the ONE admin write to a content
--    table, confined to three boolean columns of user_settings. The
--    instance owner never reads anything else on that row.
-- ---------------------------------------------------------------------

create or replace function public.admin_get_feature_flags(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select jsonb_build_object(
			'voice_capture_enabled', s.voice_capture_enabled,
			'ai_categorisation_enabled', s.ai_categorisation_enabled,
			'claude_vision_label_scan_enabled', s.claude_vision_label_scan_enabled)
		 from public.user_settings s
		 join public.profiles p on p.personal_space_id = s.space_id
		 where p.id = p_user and app.is_instance_owner()),
		'{}'::jsonb)
$$;

create or replace function public.admin_set_feature_flags(p_user uuid, p_flags jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_space uuid;
begin
	if not app.is_instance_owner() then raise exception 'Instance owner only'; end if;
	select personal_space_id into v_space from public.profiles where id = p_user;
	if v_space is null then raise exception 'No such user'; end if;
	insert into public.user_settings (space_id, created_by) values (v_space, p_user)
	on conflict (space_id) do nothing;
	update public.user_settings s set
		voice_capture_enabled            = coalesce((p_flags ->> 'voice_capture_enabled')::boolean, s.voice_capture_enabled),
		ai_categorisation_enabled        = coalesce((p_flags ->> 'ai_categorisation_enabled')::boolean, s.ai_categorisation_enabled),
		claude_vision_label_scan_enabled = coalesce((p_flags ->> 'claude_vision_label_scan_enabled')::boolean, s.claude_vision_label_scan_enabled)
	where s.space_id = v_space;
	perform app.audit('feature_flags_changed', p_subject_user_id => p_user, p_meta => p_flags);
	return public.admin_get_feature_flags(p_user);
end
$$;

revoke all on function public.admin_get_feature_flags(uuid) from public;
revoke all on function public.admin_set_feature_flags(uuid, jsonb) from public;
grant execute on function public.admin_get_feature_flags(uuid) to authenticated, service_role;
grant execute on function public.admin_set_feature_flags(uuid, jsonb) to authenticated, service_role;
