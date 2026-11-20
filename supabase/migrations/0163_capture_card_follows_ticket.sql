-- 0163 — a capture's review card is answered when its ticket leaves the Inbox,
-- by any door.
--
-- A capture filed as a task makes a ticket in the Inbox and a card in the
-- review queue: one decision shown in two places. Accepting the card moves
-- the ticket on. The other direction was true for one route only (the move
-- endpoint stamped the capture); editing the ticket's status, a bulk move, a
-- board drag, a cancel and the Work pages all left the card waiting, so the
-- evening review asked again about something already dealt with.
--
-- The rule belongs where every door passes: on the ticket row. When a
-- ticket's status moves out of an Inbox status, any capture that made it and
-- is still waiting is marked reviewed.
--
-- SECURITY DEFINER: the person moving a shared ticket may not own the
-- capture that made it. The function touches only captures that point at
-- the ticket being moved, and only fills an empty reviewed_at.

create or replace function public.tickets_settle_capture_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_was text;
	v_now text;
begin
	if new.status_id is not distinct from old.status_id then
		return null;
	end if;
	select s.category into v_was from public.ticket_statuses s where s.id = old.status_id;
	select s.category into v_now from public.ticket_statuses s where s.id = new.status_id;
	if v_was is distinct from 'inbox' or v_now is null or v_now = 'inbox' then
		return null;
	end if;
	update public.raw_captures c
	set reviewed_at = now()
	where c.routed_to = 'tickets'
	  and c.routed_id = new.id
	  and c.reviewed_at is null;
	return null;
end
$$;

revoke all on function public.tickets_settle_capture_card() from public, anon, authenticated;

drop trigger if exists tickets_settle_capture_card on public.tickets;
create trigger tickets_settle_capture_card
	after update of status_id on public.tickets
	for each row execute function public.tickets_settle_capture_card();
