-- 0168 — nudges from one person to another (master run §7; research rule 30).
--
-- Someone who can see an item of yours (through a share, or in a team)
-- taps Nudge on it. You get a push; the wall says it. It is outside the
-- interruption budget: a person reaching for you is not the app nagging.
-- You have a one-tap "Not today" that needs no explanation, and the person
-- who nudged is told when the thing is done.
--
-- A nudge belongs to the person who RECEIVES it: it sits in their personal
-- space and only they can read it, like the interruption ledger beside it.
-- The sender never reads this table. The server writes the row as the
-- recipient after checking, as the sender, that the sender can see the
-- ticket; and it tells the sender about "done" by a message of their own.
-- So nothing about one person's tickets or answers is readable by the
-- other beyond what was already shared.
--
-- Depends on: 0161.

create table if not exists public.nudges (
	id           uuid        primary key default gen_random_uuid(),
	at           timestamptz not null default now(),
	ticket_id    uuid        not null references public.tickets (id) on delete cascade,
	-- who sent it; kept if their account goes, so the history still reads
	from_user    uuid        references auth.users (id) on delete set null,
	from_name    text        not null,
	-- which of the fixed wordings (lib/nudges/nudge.ts); the words themselves are kept as sent
	preset       text        not null,
	wording      text        not null,
	-- 'not_today': set aside by the recipient, no reason asked. 'done': the thing was finished.
	answer       text        check (answer in ('not_today', 'done')),
	answered_at  timestamptz,
	-- when the sender was told it was done; null until then
	done_told_at timestamptz
);

select app.adopt_table('nudges');
alter table public.nudges enable row level security;
grant all on public.nudges to service_role;

insert into public.entity_groups (table_name, section, entity_group)
values ('nudges', 'platform', 'nudges')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

drop policy if exists "deny all"     on public.nudges;
drop policy if exists nudges_select  on public.nudges;
drop policy if exists nudges_insert  on public.nudges;
drop policy if exists nudges_update  on public.nudges;
drop policy if exists nudges_delete  on public.nudges;
create policy nudges_select on public.nudges for select to authenticated using (space_id = app.personal_space());
create policy nudges_insert on public.nudges for insert to authenticated with check (space_id = app.personal_space());
create policy nudges_update on public.nudges for update to authenticated using (space_id = app.personal_space()) with check (space_id = app.personal_space());
create policy nudges_delete on public.nudges for delete to authenticated using (space_id = app.personal_space());
grant select, insert, update, delete on public.nudges to authenticated;
alter table public.nudges alter column space_id set default app.personal_space();
alter table public.nudges alter column created_by set default auth.uid();

create index if not exists nudges_open_idx on public.nudges (space_id, at desc) where answer is null;
create index if not exists nudges_untold_idx on public.nudges (ticket_id) where done_told_at is null;
