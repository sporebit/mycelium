-- 0175 — by-hand holdings for net worth (master run §10, Stream F).
--
-- Net worth counts things no feed can see: the pension, the house, the
-- mortgage, the cars. A person types a figure and the date it was true.
-- Every figure is kept, so the net-worth line over time is honest about
-- when a holding was last updated, and a figure a year old reads as a
-- figure a year old.
--
--   finance_holdings        one row per thing: kind, name, note
--   finance_holding_values  one row per figure given: pence, the day it
--                           was true; a mortgage is kept as a negative
--
-- Both are finance tables: owner-only by the shape of their rules (the
-- row's space is the reader's own and nothing else), in a section that can
-- never be named in a share.
--
-- Depends on: 0103 (app.adopt_table, app.personal_space), 0111.

create table if not exists public.finance_holdings (
	id         uuid primary key default gen_random_uuid(),
	kind       text not null check (kind in ('pension', 'property', 'mortgage', 'vehicle', 'other')),
	name       text not null check (length(btrim(name)) between 1 and 80),
	note       text check (note is null or length(note) <= 300),
	created_at timestamptz not null default now()
);

create table if not exists public.finance_holding_values (
	id          uuid primary key default gen_random_uuid(),
	holding_id  uuid not null references public.finance_holdings(id) on delete cascade,
	value_pence bigint not null check (value_pence between -100000000000 and 100000000000),
	as_of       date not null,
	created_at  timestamptz not null default now()
);

do $$
declare
	t text;
begin
	foreach t in array array['finance_holdings', 'finance_holding_values']
	loop
		perform app.adopt_table(t);
		execute format('alter table public.%I enable row level security', t);
		execute format('grant all on public.%I to service_role', t);
		insert into public.entity_groups (table_name, section, entity_group)
		values (t, 'finance', 'holdings')
		on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;
		execute format('drop policy if exists "deny all" on public.%I', t);
		execute format('drop policy if exists %I on public.%I', t || '_select', t);
		execute format('drop policy if exists %I on public.%I', t || '_insert', t);
		execute format('drop policy if exists %I on public.%I', t || '_update', t);
		execute format('drop policy if exists %I on public.%I', t || '_delete', t);
		-- owner-only, the shape every finance table has (0111)
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

-- one figure per holding per day; a second figure for the same day replaces the first
create unique index if not exists finance_holding_values_one_per_day on public.finance_holding_values (holding_id, as_of);
create index if not exists finance_holding_values_by_holding on public.finance_holding_values (holding_id, as_of desc);

-- a value row belongs to the same space as its holding: refused at the database, not left to the application
create or replace function app.finance_holding_values_same_space()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not exists (select 1 from public.finance_holdings h where h.id = new.holding_id and h.space_id = new.space_id) then
		raise exception 'a holding value must be in the same space as its holding';
	end if;
	return new;
end
$$;
revoke all on function app.finance_holding_values_same_space() from public;
drop trigger if exists finance_holding_values_00_same_space on public.finance_holding_values;
create trigger finance_holding_values_00_same_space
	before insert or update on public.finance_holding_values
	for each row execute function app.finance_holding_values_same_space();

do $$
begin
	if not exists (select 1 from public.entity_groups where table_name = 'finance_holdings' and section = 'finance') then
		raise exception 'finance holdings: the table is not in the finance section';
	end if;
end
$$;
