-- 0119_tickets_part_e.sql
-- Tickets — Part E: capture, reminders fold, check-ins, crons (spec §7.2,
-- §8.1, §8.2, §13 step 4) plus the api_usage table Part F's rundown cap
-- needs (spec §9.1; the table did not exist anywhere — see
-- docs/multi-user-handoff.md "api_usage does not exist").
--
--   1. tickets.remind_sent_at / checkin_sent_on — send bookkeeping for the
--      reminders cron and the scheduled-day check-in.
--   2. Private storage bucket `tickets` for capture attachments (photos,
--      PDFs) — the receipts pattern; reads are signed URLs.
--   3. api_usage — per-call LLM cost rows tagged by feature, adopted into
--      spaces so the monthly cap is per user.
--   4. reminders → tickets (kind = reminder, remind_at): every pending or
--      recurring reminder becomes a ticket in Next; recurring ones carry an
--      RRULE and are re-armed in place by the cron. The reminders table is
--      kept until the count below has been checked live.
--
-- Depends on: 0118.

-- 1. send bookkeeping -------------------------------------------------
alter table public.tickets
	add column if not exists remind_sent_at   timestamptz,
	add column if not exists checkin_sent_on  date;

create index if not exists tickets_remind_idx
	on public.tickets (remind_at)
	where remind_at is not null and remind_sent_at is null;

-- 2. attachments bucket ----------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('tickets', 'tickets', false, 10485760)
on conflict (id) do nothing;

-- Authenticated users may manage objects in this bucket; the app writes
-- under <ticket id>/… server-side and only hands out signed URLs.
drop policy if exists "tickets attachments read"   on storage.objects;
drop policy if exists "tickets attachments write"  on storage.objects;
drop policy if exists "tickets attachments delete" on storage.objects;
create policy "tickets attachments read"   on storage.objects for select to authenticated using (bucket_id = 'tickets');
create policy "tickets attachments write"  on storage.objects for insert to authenticated with check (bucket_id = 'tickets');
create policy "tickets attachments delete" on storage.objects for delete to authenticated using (bucket_id = 'tickets');

-- 3. api_usage --------------------------------------------------------
create table if not exists public.api_usage (
	id            uuid primary key default gen_random_uuid(),
	at            timestamptz not null default now(),
	tag           text not null,                 -- e.g. tickets.rundown
	provider      text not null default 'anthropic',
	model         text,
	input_tokens  int  not null default 0,
	output_tokens int  not null default 0,
	cost_pence    numeric(10,3) not null default 0,
	meta          jsonb
);
create index if not exists api_usage_tag_at_idx on public.api_usage (tag, at desc);
select app.adopt_table('api_usage');
alter table public.api_usage enable row level security;
insert into public.entity_groups (table_name, section, entity_group)
values ('api_usage', 'platform', 'api_usage')
on conflict do nothing;

-- 4. reminders → tickets ------------------------------------------------
do $$
declare
	r         record;
	v_status  uuid;
	v_rrule   text;
	n_in      int := 0;
	n_out     int := 0;
begin
	for r in
		select * from public.reminders
		where cancelled = false and (sent_at is null or recurrence is not null)
	loop
		n_in := n_in + 1;
		if exists (select 1 from public.tickets t where t.kind = 'reminder' and t.meta->>'legacy_reminder_id' = r.id::text) then
			continue;
		end if;
		v_status := public.ticket_status_for(r.space_id, 'next');
		v_rrule := case r.recurrence
			when 'daily'   then 'FREQ=DAILY'
			when 'weekly'  then 'FREQ=WEEKLY'
			when 'monthly' then 'FREQ=MONTHLY'
			else null
		end;
		insert into public.tickets (
			space_id, created_by, owner, title, kind, status_id, source,
			urgency, priority_score, where_ctx, tools, time_window,
			remind_at, remind_sent_at, recurrence_rrule, recurrence_mode, meta, created_at
		) values (
			r.space_id, r.created_by, r.created_by::text, r.message, 'reminder', v_status, 'import',
			'this_week', 0.5, 'anywhere', '{none}', 'anytime',
			-- a recurring reminder whose last occurrence already fired is re-armed by the cron
			case when r.sent_at is not null and v_rrule is not null then r.due_at else r.due_at end,
			case when r.sent_at is not null and v_rrule is null then r.sent_at else null end,
			v_rrule,
			null,  -- recurring reminders re-arm in place (mode null); 'spawn' marks hidden templates
			jsonb_build_object('legacy_reminder_id', r.id, 'legacy_recurrence', r.recurrence),
			r.created_at
		);
		n_out := n_out + 1;
	end loop;
	raise notice 'reminders fold: % candidate rows, % tickets created', n_in, n_out;
end
$$;
