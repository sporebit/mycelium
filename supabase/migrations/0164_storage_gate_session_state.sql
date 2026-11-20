-- 0164 — the file store obeys the session rules too, and the app can ask
-- why a session is refused.
--
-- 1. Storage. 0160 put one gate in front of the data API (PostgREST's
--    pre-request hook). The Storage API is a different door: it reaches
--    storage.objects directly and never runs that hook. Most file policies
--    go through app.accessible_spaces(), which checks the session, but not
--    all: the Day log's linked-teammate rule does not, so a teammate with a
--    password-only or signed-out session could still fetch the shareable
--    photos of scenes they are in.
--
--    One restrictive policy closes the door whatever the other policies
--    say, now and for any bucket added later: a signed-in role touches a
--    stored file only with a session that is live and has its second
--    factor. (Restrictive policies are ANDed with every permissive one.)
--
-- 2. session_state(). The database refuses a session for one of three
--    reasons and until now only it knew which. The app showed empty pages
--    and 500s to: a device signed out from elsewhere; and someone who has
--    just become an owner or admin and has no authenticator yet (told to
--    "enter your code" when they have none). The middleware now asks, and
--    sends the person to the right page.
--
-- Depends on: 0160.

-- 1. storage ---------------------------------------------------------------
drop policy if exists "a live session with its second factor" on storage.objects;
create policy "a live session with its second factor" on storage.objects
	as restrictive
	for all
	to authenticated
	using (app.session_ok())
	with check (app.session_ok());

-- 2. why a session is refused ------------------------------------------------
create or replace function public.session_state()
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when auth.uid() is null then 'anonymous'
		when not app.session_live() then 'session_ended'
		when app.second_factor_ok() then 'ok'
		when exists (
			select 1 from auth.mfa_factors f
			where f.user_id = auth.uid() and f.status = 'verified'
		) then 'mfa_required'
		-- No authenticator, and a role that must have one.
		else 'enrol_required'
	end
$$;

revoke all on function public.session_state() from public, anon;
grant execute on function public.session_state() to authenticated, service_role;

-- The gate lets the question through: it is how a refused session finds out why.
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
	if v_path in ('/rpc/requires_totp', '/rpc/session_state') then return; end if;
	if not app.session_live() then
		raise exception 'This session has been signed out. Sign in again.' using errcode = '42501', hint = 'session_ended';
	end if;
	if not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then
		raise exception 'This account now needs an authenticator. Set one up under Settings, Security to continue.'
			using errcode = '42501', hint = 'enrol_required';
	end if;
	raise exception 'A second factor is required for this account. Enter your authenticator code to continue.'
		using errcode = '42501', hint = 'mfa_required';
end
$$;

revoke all on function public.request_gate() from public;
grant execute on function public.request_gate() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
