-- 0160_access_hardening.sql
-- Closes what the second-user test pass found on 2026-11-20 (master run,
-- Phase 1), before a second real user exists.
--
-- 1. A second factor that is enrolled is now REQUIRED, in the database.
--    Before: a password alone gave a session at assurance level aal1, and
--    nothing below the /admin and /api/account paths looked at the level,
--    so a user with an authenticator could be read in full with just their
--    password, through the app or straight through the REST API.
--    Now: app.second_factor_ok() is false for a session at aal1 whose user
--    has a verified factor. app.personal_space() and app.accessible_spaces()
--    return nothing for such a session (the same shape as a disabled user,
--    0113), which closes every content table, and every storage bucket and
--    realtime channel whose policy rests on one. public.request_gate() runs
--    before every REST request and refuses the rest (access tables, RPCs),
--    except the one call the sign-in page needs.
--    Tokens the app mints for its own system work (crons, webhooks, API
--    tokens; lib/system/jwt.ts) carry amr = [{method: "system"}] and are
--    signed with the project secret, which no client holds; they pass.
--    The same function refuses an owner or admin who has not enrolled an
--    authenticator at all (1c), and a session that was signed out (1b).
--
-- 2. Functions that ran with the owner's rights but trusted their caller:
--    - rate_limit_take: was callable with the public anon key and took the
--      bucket's size from the caller, so a stranger could empty the sign-in
--      limiter for any email (locking that person out) or refill it before
--      each guess. Now service role only; the app calls it server-side.
--    - second_factor_failed / _succeeded / _locked: acted on auth.uid(), so
--      the password-only session they exist to stop could clear its own
--      lockout between guesses. Replaced by versions that take the user and
--      are service role only.
--    - people_purge_deleted: SECURITY DEFINER with no space filter; any
--      signed-in user could permanently purge every user's binned people.
--      Now SECURITY INVOKER, so RLS limits it to what the caller may delete.
--    - pc_metrics_prune / pc_metrics_rollup: scheduled jobs, never called
--      by a client. Service role only.
--    - delete_my_account and create_user_grant: the app asked for a fresh
--      second factor on the route (and for grants did not even do that);
--      the functions themselves accepted any session. Both now require an
--      aal2 session themselves.
--
-- 3. No function in public or app is executable with the anon key any more,
--    except invite_preview (the invite page before sign-in). New functions
--    no longer get that by default.
--
-- lib/access/secondFactor.test.ts and lib/access/security.test.ts prove it.
-- Depends on: 0159.

-- 1. the second factor --------------------------------------------------
create or replace function app.second_factor_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select
		coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
		or coalesce(auth.jwt() -> 'amr' -> 0 ->> 'method', '') = 'system'
		or (
			not exists (
				select 1 from auth.mfa_factors f
				where f.user_id = auth.uid() and f.status = 'verified'
			)
			-- 1c. "Mandatory" means mandatory. The instance owner and every team
			-- owner or admin must have an authenticator (requires_totp(), 0112);
			-- until 0160 that was a redirect on the sign-in page and nothing
			-- more. Without one they can sign in and enrol, and that is all.
			and not public.requires_totp()
		)
$$;

revoke all on function app.second_factor_ok() from public;
grant execute on function app.second_factor_ok() to authenticated, service_role;

-- 1b. A session that was signed out is over at once.
--     "Sign out there" (Settings → Security) deleted the row in
--     auth.sessions, but the other device's access token stayed valid until
--     it expired, up to an hour later: the middleware checks a token's
--     signature, not whether its session still exists. Every GoTrue token
--     names its session; this looks it up (a primary-key read). Tokens the
--     app mints for system work name no session and pass.
create or replace function app.session_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select
		(auth.jwt() ->> 'session_id') is null
		or exists (
			select 1 from auth.sessions s
			where s.id = app.uuid_or_null(auth.jwt() ->> 'session_id')
		)
$$;

revoke all on function app.session_live() from public;
grant execute on function app.session_live() to authenticated, service_role;

-- Both rules as one question, for the access functions and the request gate.
create or replace function app.session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select app.session_live() and app.second_factor_ok()
$$;

revoke all on function app.session_ok() from public;
grant execute on function app.session_ok() to authenticated, service_role;

create or replace function app.personal_space()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select p.personal_space_id
	from public.profiles p
	where p.id = auth.uid() and p.disabled_at is null and app.session_ok()
$$;

create or replace function app.accessible_spaces(p_entity_group text, p_verb text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
	with me as (
		select p.id as uid from public.profiles p
		where p.id = auth.uid() and p.disabled_at is null and app.session_ok()
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

-- Runs before every REST request (PostgREST db-pre-request). A signed-in
-- session that still owes its second factor may make exactly one call: the
-- sign-in page asking whether this account must enrol one. Everything else
-- is refused here, whatever table or function it names.
create or replace function public.request_gate()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_role text := coalesce(auth.jwt() ->> 'role', '');
	v_path text := coalesce(current_setting('request.path', true), '');
begin
	if v_role <> 'authenticated' then return; end if;
	if app.session_ok() then return; end if;
	if v_path in ('/rpc/requires_totp') then return; end if;
	if not app.session_live() then
		raise exception 'This session has been signed out. Sign in again.' using errcode = '42501', hint = 'session_ended';
	end if;
	raise exception 'A second factor is required for this account. Enter your authenticator code to continue.'
		using errcode = '42501', hint = 'mfa_required';
end
$$;

revoke all on function public.request_gate() from public;
grant execute on function public.request_gate() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.request_gate';
notify pgrst, 'reload config';

-- 2. functions that trusted their caller --------------------------------

-- rate limiter: server-side only
revoke all on function public.rate_limit_take(text, integer, double precision, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_take(text, integer, double precision, integer) to service_role;

-- second-factor lockout: the server names the user; nobody can clear their own
drop function if exists public.second_factor_failed();
drop function if exists public.second_factor_succeeded();
drop function if exists public.second_factor_locked();

create or replace function public.second_factor_locked(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select count(*) >= 10
	from public.second_factor_failures f
	where f.user_id = p_user and f.at > now() - interval '15 minutes'
$$;

create or replace function public.second_factor_failed(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_locked boolean;
begin
	if p_user is null then raise exception 'No user'; end if;
	insert into public.second_factor_failures (user_id) values (p_user);
	delete from public.second_factor_failures where user_id = p_user and at < now() - interval '1 day';
	select public.second_factor_locked(p_user) into v_locked;
	if v_locked then
		perform app.audit('second_factor_locked', p_subject_user_id => p_user);
	end if;
	return v_locked;
end
$$;

create or replace function public.second_factor_succeeded(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
	delete from public.second_factor_failures where user_id = p_user
$$;

revoke all on function public.second_factor_locked(uuid) from public, anon, authenticated;
revoke all on function public.second_factor_failed(uuid) from public, anon, authenticated;
revoke all on function public.second_factor_succeeded(uuid) from public, anon, authenticated;
grant execute on function public.second_factor_locked(uuid) to service_role;
grant execute on function public.second_factor_failed(uuid) to service_role;
grant execute on function public.second_factor_succeeded(uuid) to service_role;

-- the people bin: only what the caller may delete
create or replace function public.people_purge_deleted(p_days integer default 30)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
	n int;
begin
	delete from public.people
	where deleted_at is not null and deleted_at < now() - make_interval(days => greatest(p_days, 1));
	get diagnostics n = row_count;
	return n;
end
$$;

revoke all on function public.people_purge_deleted(integer) from public, anon;
grant execute on function public.people_purge_deleted(integer) to authenticated, service_role;

-- scheduled maintenance: not a client's business
revoke all on function public.pc_metrics_prune() from public, anon, authenticated;
revoke all on function public.pc_metrics_rollup(integer) from public, anon, authenticated;
grant execute on function public.pc_metrics_prune() to service_role;
grant execute on function public.pc_metrics_rollup(integer) to service_role;

-- deleting an account and sharing a personal space need a second factor
-- presented in THIS session, whichever door the call came through
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
	if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
		raise exception 'A second factor is required to delete an account' using errcode = '42501', hint = 'mfa_required';
	end if;
	if app.is_instance_owner() then raise exception 'The instance owner cannot delete their own account'; end if;
	perform app.audit('account_deleted', p_subject_user_id => v_me, p_meta => jsonb_build_object('self', true));
	perform app.delete_user(v_me);
end
$$;

-- create_user_grant keeps its body; a guard function is called first by a
-- wrapper so the original logic (0112) is not restated here.
alter function public.create_user_grant(uuid, text, text[], text[], timestamptz, text) rename to create_user_grant_unchecked;
revoke all on function public.create_user_grant_unchecked(uuid, text, text[], text[], timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_user_grant_unchecked(uuid, text, text[], text[], timestamptz, text) to service_role;

create or replace function public.create_user_grant(
	p_grantee       uuid,
	p_section       text,
	p_entity_groups text[],
	p_verbs         text[],
	p_expires_at    timestamptz default null,
	p_reason        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then raise exception 'Not signed in'; end if;
	if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
		raise exception 'A second factor is required to share your space' using errcode = '42501', hint = 'mfa_required';
	end if;
	return public.create_user_grant_unchecked(p_grantee, p_section, p_entity_groups, p_verbs, p_expires_at, p_reason);
end
$$;

revoke all on function public.create_user_grant(uuid, text, text[], text[], timestamptz, text) from public, anon;
grant execute on function public.create_user_grant(uuid, text, text[], text[], timestamptz, text) to authenticated, service_role;

-- 3. nothing for the anon key but the invite preview ---------------------
do $$
declare
	f record;
begin
	for f in
		select p.oid::regprocedure as sig,
		       has_function_privilege('authenticated', p.oid, 'execute') as auth_had
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname in ('public', 'app')
			and p.prokind = 'f'
			and has_function_privilege('anon', p.oid, 'execute')
			and not exists (
				select 1 from pg_depend d
				join pg_extension e on e.oid = d.refobjid
				where d.objid = p.oid and d.deptype = 'e'
			)
			and p.oid::regprocedure::text not in ('invite_preview(text)', 'public.invite_preview(text)', 'request_gate()', 'public.request_gate()')
	loop
		execute format('revoke all on function %s from public, anon', f.sig);
		if f.auth_had then
			execute format('grant execute on function %s to authenticated', f.sig);
		end if;
		execute format('grant execute on function %s to service_role', f.sig);
	end loop;
end
$$;

alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema app revoke execute on functions from public;

-- 4. An invite never changes the role of someone already in the team ------
-- accept_invite (0112) wrote the invite's role over an existing member's:
-- an admin could invite the owner's own address as "viewer", and accepting
-- it left the team with no owner. Read from the SQL on 2026-11-20, not seen
-- happen. An existing member now keeps their role; the invite is still
-- spent, and the answer carries the role they really have.
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
	v_role  text;
begin
	if v_me is null then raise exception 'Not signed in'; end if;
	select * into v_inv from public.invites i
		where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
		for update;
	if v_inv.id is null then raise exception 'No such invite'; end if;
	if v_inv.accepted_at is not null then raise exception 'This invite has already been used'; end if;
	if v_inv.expires_at <= now() then raise exception 'This invite has expired'; end if;
	if v_inv.email <> v_email then raise exception 'This invite was sent to a different email address'; end if;

	v_role := v_inv.role;
	if v_inv.team_id is not null then
		insert into public.team_members (team_id, user_id, role)
		values (v_inv.team_id, v_me, v_inv.role)
		on conflict (team_id, user_id) do nothing;
		select tm.role into v_role from public.team_members tm where tm.team_id = v_inv.team_id and tm.user_id = v_me;
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

	return query select v_inv.team_id, v_slug, v_role, public.requires_totp();
end
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated, service_role;
