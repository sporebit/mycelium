-- 0123_sprints.sql
-- Sprints for technical projects (Phil, 2026-09-17: "Tickets … worked in
-- sprints"). Design decision taken with the build (backlog: "design first"):
--
--   A sprint is a COMMITMENT LAYER on top of GTD, not a replacement for it.
--   Tickets keep their category (next / doing / …); `tickets.sprint_id` says
--   which iteration the ticket was committed to. The active sprint answers
--   "what did I commit to this iteration"; the Now view keeps answering
--   "what can I do here, now" and gains a Sprint chip that limits its
--   candidates to tickets in an active sprint. So there is one answer to
--   "what am I working on": Doing; the sprint is the fence around Next.
--
--   sprints: per project, planned → active → closed. One active sprint per
--   project at a time. Closing a sprint snapshots points committed / done
--   (velocity) and moves unfinished tickets to `carry_to` (a planned sprint)
--   or out of any sprint. Burndown = points done per day from
--   ticket_completions for the sprint's tickets.
--
-- RLS via app.adopt_table (space policies); registry organisation.tickets.
-- Depends on: 0122.

create table if not exists public.sprints (
	id               uuid primary key default gen_random_uuid(),
	project_id       uuid not null references public.projects(id) on delete cascade,
	name             text not null,
	goal             text,
	starts_on        date not null,
	ends_on          date not null,
	status           text not null default 'planned' check (status in ('planned', 'active', 'closed')),
	points_committed int,
	points_done      int,
	closed_at        timestamptz,
	sort_order       int  not null default 0,
	created_at       timestamptz not null default now(),
	updated_at       timestamptz not null default now(),
	check (ends_on >= starts_on)
);
create unique index if not exists sprints_one_active_per_project
	on public.sprints (project_id) where status = 'active';
create index if not exists sprints_project_idx on public.sprints (project_id, status, starts_on);

alter table public.tickets
	add column if not exists sprint_id uuid references public.sprints(id) on delete set null;
create index if not exists tickets_sprint_idx on public.tickets (sprint_id) where sprint_id is not null;

select app.adopt_table('sprints', 'projects', 'project_id');
alter table public.sprints enable row level security;
insert into public.entity_groups (table_name, section, entity_group)
values ('sprints', 'organisation', 'tickets')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;
