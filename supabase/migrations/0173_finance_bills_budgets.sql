-- 0173 — bills and subscriptions, and a budget (master run §10, Stream F).
--
-- Recurring payments are worked out from the transactions each time they
-- are asked for (lib/finance/recurring.ts); nothing about them is stored
-- except what the person has said about one:
--
--   finance_recurring_marks   "keep", "cancel", or "this is not a
--                             subscription", against a merchant's key
--   finance_budgets           what a month is meant to cost, by category
--
-- Both are finance tables: owner-only by the shape of their rules (the
-- row's space is the reader's own and nothing else), in a section that can
-- never be named in a share.
--
-- Depends on: 0103 (app.adopt_table, app.personal_space), 0111.

create table if not exists public.finance_recurring_marks (
	id           uuid primary key default gen_random_uuid(),
	merchant_key text not null check (length(merchant_key) between 3 and 80),
	mark         text not null check (mark in ('keep', 'cancel', 'not_recurring')),
	note         text,
	marked_at    timestamptz not null default now()
);

create table if not exists public.finance_budgets (
	id            uuid primary key default gen_random_uuid(),
	category      text not null check (length(btrim(category)) between 1 and 60),
	monthly_pence integer not null check (monthly_pence between 0 and 100000000),
	updated_at    timestamptz not null default now()
);

do $$
declare
	t text;
	g text;
begin
	foreach t in array array['finance_recurring_marks', 'finance_budgets']
	loop
		g := case t when 'finance_recurring_marks' then 'recurring' else 'budgets' end;
		perform app.adopt_table(t);
		execute format('alter table public.%I enable row level security', t);
		execute format('grant all on public.%I to service_role', t);
		insert into public.entity_groups (table_name, section, entity_group)
		values (t, 'finance', g)
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

create unique index if not exists finance_recurring_marks_once on public.finance_recurring_marks (space_id, merchant_key);
create unique index if not exists finance_budgets_once on public.finance_budgets (space_id, category);
