-- 0170 — cancel an invite; know before promoting someone that they have no
-- authenticator.
--
-- 1. An invite could be created and never taken back: a mistyped address
--    stayed a live way in for seven days. cancel_invite() removes an invite
--    that has not been accepted. The same people who may create one may
--    cancel it: whoever sent it, the team's owner, or the team's admin for a
--    member or viewer invite; the instance owner for an invite with no
--    team. An accepted invite is history and stays.
--
-- 2. Since 0160 a team owner or admin can do nothing until they have an
--    authenticator. Someone promoted without one is sent to set it up, but
--    the person promoting them was not told beforehand.
--    team_members_without_totp() tells a team's owner or admin which
--    members have none, so the page can say so before the change is made.
--    It says nothing else about anyone's sign-in.
--
-- Depends on: 0112 (invites, app.team_role, app.is_instance_owner),
-- 0160 (app.session_ok).

create or replace function public.cancel_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_me   uuid := auth.uid();
	v_inv  public.invites%rowtype;
	v_mine text;
begin
	if v_me is null or not app.session_ok() then raise exception 'Not signed in'; end if;
	select * into v_inv from public.invites i where i.id = p_invite;
	-- the same answer whether it does not exist or is not yours to cancel
	if not found then raise exception 'No such invite' using errcode = 'P0002'; end if;

	if v_inv.invited_by = v_me then
		null;
	elsif v_inv.team_id is null then
		if not app.is_instance_owner() then raise exception 'No such invite' using errcode = 'P0002'; end if;
	else
		v_mine := app.team_role(v_inv.team_id, v_me);
		if v_mine = 'owner' then
			null;
		elsif v_mine = 'admin' and v_inv.role in ('member', 'viewer') then
			null;
		else
			raise exception 'No such invite' using errcode = 'P0002';
		end if;
	end if;

	if v_inv.accepted_at is not null then
		raise exception 'That invite has already been accepted' using errcode = '23514', hint = 'invite_accepted';
	end if;
	delete from public.invites i where i.id = p_invite;
end
$$;

revoke all on function public.cancel_invite(uuid) from public, anon;
grant execute on function public.cancel_invite(uuid) to authenticated, service_role;

create or replace function public.team_members_without_totp(p_team uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
	select tm.user_id
	from public.team_members tm
	where tm.team_id = p_team
	  and app.session_ok()
	  and app.team_role(p_team, auth.uid()) in ('owner', 'admin')
	  and not exists (
		select 1 from auth.mfa_factors f
		where f.user_id = tm.user_id and f.status = 'verified'
	  )
$$;

revoke all on function public.team_members_without_totp(uuid) from public, anon;
grant execute on function public.team_members_without_totp(uuid) to authenticated, service_role;
