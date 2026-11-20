-- 0181 — Gifts, phase 1 (claude/gifts-spec.md §3; MYC-190, lane H3).
--
-- A place to drop a gift idea the moment it appears, a set of occasions
-- with real dates that push the ideas back before the date, and the
-- reminders that make the list worth keeping (the problem is forgetting,
-- not storage). Four tables:
--
--   gift_occasions   one row per INSTANCE ("Kirsty's birthday 2026"), so
--                    budget, gifts and history are per year; an annual one
--                    is rolled forward by the daily cron
--   gifts            the ideas, with who, why, which occasion, a link,
--                    prices, and the lifecycle idea → shortlisted → bought →
--                    given, plus rejected
--   gift_bundles     phase 2c; created now so the FK exists
--   gift_comments    the notes thread per gift, the ticket_comments shape
--
-- All four are OWNER-ONLY (spec decision 5): the row's space is the
-- reader's own personal space and nothing else — the finance shape (0111,
-- 0173), not app.accessible_spaces. A gift list is exactly the thing the
-- recipient must not read. Entity group organisation.gifts.
--
-- Rejected gifts are never deleted (spec §12 flag 6): they are what stops
-- the phase-2 suggester proposing the same thing again. The API excludes
-- them from default views; nothing removes them.
--
-- Checked before writing (spec §13): people already has `birthday date`,
-- so §3.5's columns are NOT added; comments are per entity (ticket_comments),
-- so gift_comments copies that shape; the captures table is raw_captures;
-- pg_trgm is not installed, so the title trigram index is left out and
-- near-duplicates are found in app code (lib/gifts/similar.ts).
--
-- Depends on: 0103 (app.adopt_table, app.personal_space), 0111, people,
-- purchases, raw_captures.

create table if not exists public.gift_occasions (
	id                    uuid primary key default gen_random_uuid(),
	name                  text not null check (length(btrim(name)) between 1 and 160),
	kind                  text not null default 'other'
		check (kind in ('birthday','christmas','valentines','anniversary','graduation','new_job','wedding','new_baby','housewarming','thank_you','other')),
	person_id             uuid references public.people(id) on delete set null,
	occurs_on             date not null,
	recurrence            text not null default 'none' check (recurrence in ('none','annual')),
	source                text not null default 'manual' check (source in ('manual','person_dob','fixed')),
	previous_occasion_id  uuid references public.gift_occasions(id) on delete set null,
	budget                numeric(10,2) check (budget is null or budget >= 0),
	lead_days             int[] not null default '{30,7}',
	reminder_task_id      uuid,
	notes                 text,
	archived_at           timestamptz,
	created_at            timestamptz not null default now(),
	updated_at            timestamptz not null default now()
);

create table if not exists public.gift_bundles (
	id                 uuid primary key default gen_random_uuid(),
	name               text not null check (length(btrim(name)) between 1 and 160),
	for_person_id      uuid references public.people(id) on delete set null,
	occasion_id        uuid references public.gift_occasions(id) on delete set null,
	presentation_note  text,
	created_at         timestamptz not null default now(),
	updated_at         timestamptz not null default now()
);

create table if not exists public.gifts (
	id                uuid primary key default gen_random_uuid(),
	title             text not null check (length(btrim(title)) between 1 and 200),
	description       text,
	reason            text,
	for_person_id     uuid references public.people(id) on delete set null,
	for_label         text,
	occasion_id       uuid references public.gift_occasions(id) on delete set null,
	needed_by         date,
	status            text not null default 'idea'
		check (status in ('idea','shortlisted','bought','given','rejected')),
	rejected_reason   text,
	origin            text not null default 'manual' check (origin in ('manual','capture','suggested')),
	url               text,
	retailer          text,
	category          text,
	currency          text not null default 'GBP',
	target_price      numeric(10,2) check (target_price is null or target_price >= 0),
	paid_amount       numeric(10,2) check (paid_amount is null or paid_amount >= 0),
	paid_at           date,
	given_at          date,
	bundle_id         uuid references public.gift_bundles(id) on delete set null,
	purchase_id       uuid references public.purchases(id) on delete set null,
	price_check       jsonb,
	price_checked_at  timestamptz,
	suggestion        jsonb,
	raw_text          text,
	capture_id        uuid references public.raw_captures(id) on delete set null,
	created_at        timestamptz not null default now(),
	updated_at        timestamptz not null default now()
);

create table if not exists public.gift_comments (
	id          uuid primary key default gen_random_uuid(),
	gift_id     uuid not null references public.gifts(id) on delete cascade,
	body        text not null check (length(btrim(body)) between 1 and 20000),
	body_doc    jsonb,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);

do $$
declare
	t text;
begin
	foreach t in array array['gift_occasions', 'gift_bundles', 'gifts', 'gift_comments']
	loop
		perform app.adopt_table(t);
		execute format('alter table public.%I enable row level security', t);
		execute format('grant all on public.%I to service_role', t);
		insert into public.entity_groups (table_name, section, entity_group)
		values (t, 'organisation', 'gifts')
		on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;
		execute format('drop policy if exists "deny all" on public.%I', t);
		execute format('drop policy if exists %I on public.%I', t || '_select', t);
		execute format('drop policy if exists %I on public.%I', t || '_insert', t);
		execute format('drop policy if exists %I on public.%I', t || '_update', t);
		execute format('drop policy if exists %I on public.%I', t || '_delete', t);
		-- owner-only: the reader's own personal space and nothing else (decision 5)
		execute format('create policy %I on public.%I for select to authenticated using (space_id = app.personal_space())', t || '_select', t);
		execute format('create policy %I on public.%I for insert to authenticated with check (space_id = app.personal_space())', t || '_insert', t);
		execute format('create policy %I on public.%I for update to authenticated using (space_id = app.personal_space()) with check (space_id = app.personal_space())', t || '_update', t);
		execute format('create policy %I on public.%I for delete to authenticated using (space_id = app.personal_space())', t || '_delete', t);
		execute format('grant select, insert, update, delete on public.%I to authenticated', t);
		execute format('alter table public.%I alter column space_id set default app.personal_space()', t);
		execute format('alter table public.%I alter column created_by set default auth.uid()', t);
	end loop;
end
$$;

create index if not exists gift_occasions_space_date on public.gift_occasions (space_id, occurs_on);
create index if not exists gift_occasions_person on public.gift_occasions (person_id);
-- Roll-forward idempotency (spec §5, §12 flag 7): one annual instance per
-- (space, kind, person-or-shared, year). A double run creates nothing.
create unique index if not exists gift_occasions_annual_once
	on public.gift_occasions (space_id, kind, coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid), (extract(year from occurs_on)))
	where recurrence = 'annual' and archived_at is null;

create index if not exists gifts_space_status on public.gifts (space_id, status, needed_by);
create index if not exists gifts_person on public.gifts (for_person_id);
create index if not exists gifts_occasion on public.gifts (occasion_id);
create index if not exists gift_comments_gift on public.gift_comments (gift_id, created_at);
