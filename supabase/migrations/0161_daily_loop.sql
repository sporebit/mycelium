-- 0161_daily_loop.sql
-- The daily loop (master run §6; claude/nd-design-research.md rules 9–18,
-- 21, 26, 27).
--
--   1. day_plans / day_plan_items — today's five: one win plus up to four
--      extras, proposed the night before, accepted with one tap or by
--      itself after 45 minutes, closed in the evening. One plan per person
--      per day. They sit in organisation.tickets, so whoever may see a
--      person's Work (a team member, a direct grant) sees their day and
--      its wins, and nobody else does.
--   2. tickets — the five-minute next step every big item carries, the
--      "where I left off" note written when an item is parked, and the day
--      a slipped item was offered as Re-date / Someday / Drop (once).
--   3. interruptions — every time the app reaches for the person on its own
--      (a push, a Telegram message, the wall speaking). One budget of three
--      a day across all three; a nudge from a person, or a reply to
--      something the person started, is recorded but does not count.
--      Owner-only (platform).
--
-- Depends on: 0160.

-- 1. the day ------------------------------------------------------------
create table if not exists public.day_plans (
	id             uuid        primary key default gen_random_uuid(),
	day            date        not null,
	status         text        not null default 'proposed' check (status in ('proposed', 'accepted', 'closed')),
	-- how it became accepted: a tap, by itself after the wait, or after an edit
	accepted_by    text        check (accepted_by in ('tap', 'auto', 'edit')),
	source         text        not null default 'rules',
	free_minutes   int         not null default 0,
	budget_minutes int         not null default 0,
	-- the next-best tickets in order (what Swap offers), those held for a
	-- Re-date / Someday / Drop card, and those set aside with "Not now"
	bench          uuid[]      not null default '{}',
	slipped        uuid[]      not null default '{}',
	excluded       uuid[]      not null default '{}',
	proposed_at    timestamptz not null default now(),
	prompted_at    timestamptz,
	accepted_at    timestamptz,
	closed_at      timestamptz,
	-- written at close: what got done, moved and dropped (the numbers the
	-- monthly review reads, so they do not have to be recounted)
	summary        jsonb       not null default '{}'::jsonb,
	created_at     timestamptz not null default now(),
	updated_at     timestamptz not null default now()
);

create table if not exists public.day_plan_items (
	id            uuid        primary key default gen_random_uuid(),
	plan_id       uuid        not null references public.day_plans (id) on delete cascade,
	ticket_id     uuid        not null references public.tickets (id) on delete cascade,
	position      int         not null,
	is_win        boolean     not null default false,
	shown_minutes int         not null default 45,
	why           text,
	first_step    text,
	state         text        not null default 'planned'
		check (state in ('planned', 'started', 'done', 'good_enough', 'moved', 'dropped', 'parked', 'not_now', 'swapped')),
	started_at    timestamptz,
	timer_minutes int,
	timer_ends_at timestamptz,
	finished_at   timestamptz,
	moved_to      date,
	note          text,
	created_at    timestamptz not null default now(),
	updated_at    timestamptz not null default now(),
	constraint day_plan_items_one_per_ticket unique (plan_id, ticket_id)
);

select app.register_table('day_plans', 'organisation', 'tickets');
select app.register_table('day_plan_items', 'organisation', 'tickets', 'day_plans', 'plan_id');

create unique index if not exists day_plans_one_per_person_day on public.day_plans (space_id, created_by, day);
create index if not exists day_plans_space_day_idx on public.day_plans (space_id, day desc);
create index if not exists day_plan_items_plan_idx on public.day_plan_items (plan_id, position);
create index if not exists day_plan_items_ticket_idx on public.day_plan_items (ticket_id);
-- a focus timer that is running: nothing interrupts while one is (rule 27)
create index if not exists day_plan_items_timer_idx on public.day_plan_items (timer_ends_at) where timer_ends_at is not null and state = 'started';

-- exactly one win per plan
create unique index if not exists day_plan_items_one_win on public.day_plan_items (plan_id) where is_win and state <> 'swapped';

-- 2. tickets ------------------------------------------------------------
alter table public.tickets
	add column if not exists next_step       text,
	add column if not exists parked_note     text,
	add column if not exists parked_at       timestamptz,
	add column if not exists slip_offered_on date;

-- 3. interruptions ------------------------------------------------------
create table if not exists public.interruptions (
	id         uuid        primary key default gen_random_uuid(),
	at         timestamptz not null default now(),
	-- London date the interruption belongs to (the budget is per day)
	day        date        not null,
	channel    text        not null check (channel in ('push', 'telegram', 'wall')),
	kind       text        not null,
	-- 'app': the app started it (counts). 'person': someone nudged (does not
	-- count). 'reply': an answer to something the person started (does not).
	origin     text        not null default 'app' check (origin in ('app', 'person', 'reply')),
	counted    boolean     not null default true,
	title      text        not null,
	body       text,
	url        text,
	ticket_id  uuid        references public.tickets (id) on delete set null,
	-- a key for "the same nudge in the same words": never repeated (rule 26)
	wording    text,
	acted_at   timestamptz,
	action     text
);

select app.adopt_table('interruptions');
alter table public.interruptions enable row level security;
grant all on public.interruptions to service_role;

insert into public.entity_groups (table_name, section, entity_group)
values ('interruptions', 'platform', 'interruptions')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

drop policy if exists "deny all"            on public.interruptions;
drop policy if exists interruptions_select  on public.interruptions;
drop policy if exists interruptions_insert  on public.interruptions;
drop policy if exists interruptions_update  on public.interruptions;
drop policy if exists interruptions_delete  on public.interruptions;
create policy interruptions_select on public.interruptions for select to authenticated using (space_id = app.personal_space());
create policy interruptions_insert on public.interruptions for insert to authenticated with check (space_id = app.personal_space());
create policy interruptions_update on public.interruptions for update to authenticated using (space_id = app.personal_space()) with check (space_id = app.personal_space());
create policy interruptions_delete on public.interruptions for delete to authenticated using (space_id = app.personal_space());
grant select, insert, update, delete on public.interruptions to authenticated;
alter table public.interruptions alter column space_id set default app.personal_space();
alter table public.interruptions alter column created_by set default auth.uid();

create index if not exists interruptions_day_idx on public.interruptions (space_id, day, counted);
create index if not exists interruptions_wording_idx on public.interruptions (space_id, wording, at desc) where wording is not null;
