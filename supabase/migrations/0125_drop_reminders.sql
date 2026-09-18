-- 0125_drop_reminders.sql
-- Tickets cleanup: the reminders table was folded into tickets (kind =
-- reminder) in 0119 and every reader/writer has been on tickets since.
-- Drop it once the live count check passes: every row the fold considered
-- (not cancelled, and pending or recurring) must have a ticket carrying its
-- id in meta.legacy_reminder_id. Aborts otherwise. Depends on: 0124.

do $$
declare
	n_candidates int;
	n_folded     int;
begin
	select count(*) into n_candidates
	from public.reminders
	where cancelled = false and (sent_at is null or recurrence is not null);
	select count(*) into n_folded
	from public.reminders r
	where r.cancelled = false and (r.sent_at is null or r.recurrence is not null)
	  and exists (select 1 from public.tickets t where t.kind = 'reminder' and t.meta->>'legacy_reminder_id' = r.id::text);
	if n_folded < n_candidates then
		raise exception 'reminders drop aborted: % candidate rows but only % folded into tickets', n_candidates, n_folded;
	end if;
	raise notice 'reminders fold check: % of % rows have tickets; dropping the table', n_folded, n_candidates;
end
$$;

drop table if exists public.reminders cascade;
delete from public.entity_groups where table_name = 'reminders';
