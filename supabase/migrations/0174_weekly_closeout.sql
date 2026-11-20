-- 0174 — the weekly close-out (master run §6, Stream B part 2; research
-- rules 23, 25, 32 and §6).
--
--   weekly_closeouts   one row a person a week: the 45-minute box (when it
--                      started, the plan said at the start, when it ended,
--                      the report said at the end), the week's fill and the
--                      lifetime totals as they stood, the one quiet section
--                      raised with the answer and the why, the Screen Time
--                      typed in, the two questions with Kirsty, and — in
--                      the first close-out of a month — the eight measures
--                      computed from true history, kept so months compare.
--
-- Personal, like the interruptions ledger (0161): the row's space is the
-- reader's own personal space and nothing else. Never in a share.
--
-- Depends on: 0103 (app.adopt_table, app.personal_space), 0111, 0161.

create table if not exists public.weekly_closeouts (
	id               uuid        primary key default gen_random_uuid(),
	-- ISO week, "2026-W47"
	week             text        not null check (week ~ '^\d{4}-W\d{2}$'),
	started_at       timestamptz,
	finished_at      timestamptz,
	plan             text,
	report           text,
	-- the week's fill (win days, finished, started, planned, dropped) as it stood when finished
	fill             jsonb,
	-- lifetime totals as they stood when finished (no streak: a total only grows)
	lifetime         jsonb,
	-- the one section raised (research rule 32; Phil: ask why directly)
	section_key      text,
	section_decision text        check (section_decision in ('keep', 'pause', 'retire')),
	section_why      text,
	-- measure 7: weekly Screen Time, typed in
	screen_minutes   integer     check (screen_minutes between 0 and 10080),
	-- measure 8: the two questions with Kirsty, in their own words
	partner_answers  jsonb,
	-- measures 1–8 for the month just gone, in the first close-out of a month
	measures         jsonb,
	created_at       timestamptz not null default now(),
	updated_at       timestamptz not null default now()
);

select app.adopt_table('weekly_closeouts');
alter table public.weekly_closeouts enable row level security;
grant all on public.weekly_closeouts to service_role;

insert into public.entity_groups (table_name, section, entity_group)
values ('weekly_closeouts', 'platform', 'closeouts')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

drop policy if exists "deny all"               on public.weekly_closeouts;
drop policy if exists weekly_closeouts_select  on public.weekly_closeouts;
drop policy if exists weekly_closeouts_insert  on public.weekly_closeouts;
drop policy if exists weekly_closeouts_update  on public.weekly_closeouts;
drop policy if exists weekly_closeouts_delete  on public.weekly_closeouts;
create policy weekly_closeouts_select on public.weekly_closeouts for select to authenticated using (space_id = app.personal_space());
create policy weekly_closeouts_insert on public.weekly_closeouts for insert to authenticated with check (space_id = app.personal_space());
create policy weekly_closeouts_update on public.weekly_closeouts for update to authenticated using (space_id = app.personal_space()) with check (space_id = app.personal_space());
create policy weekly_closeouts_delete on public.weekly_closeouts for delete to authenticated using (space_id = app.personal_space());
grant select, insert, update, delete on public.weekly_closeouts to authenticated;
alter table public.weekly_closeouts alter column space_id set default app.personal_space();
alter table public.weekly_closeouts alter column created_by set default auth.uid();

create unique index if not exists weekly_closeouts_one_per_person_week on public.weekly_closeouts (space_id, created_by, week);
create index if not exists weekly_closeouts_week_idx on public.weekly_closeouts (space_id, week desc);
