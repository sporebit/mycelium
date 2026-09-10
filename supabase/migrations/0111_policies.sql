-- Migration: real row-level security on every registered table. P12 Part 3.
--
-- Generated over public.entity_groups (seeded from the registry in 0103),
-- so a table cannot be registered without getting exactly these policies,
-- and the policy text is in one place instead of 85.
--
-- For every registered table:
--   * the restrictive "deny all" from 0101 is dropped;
--   * four PERMISSIVE policies for `authenticated` are created —
--       select  using      space_id in (select app.accessible_spaces('<section.group>', 'view'))
--       insert  with check space_id in (… 'create_delete')
--       update  using / with check … 'edit'
--       delete  using      … 'create_delete'
--     except for the OWNER-ONLY sections (finance, and platform — see 0110)
--     where all four are `space_id = app.personal_space()` and the helper
--     is never called;
--   * select/insert/update/delete are granted to `authenticated` (0101
--     revoked everything; RLS is the wall, the grant is the door);
--   * space_id defaults to app.personal_space() and created_by to
--     auth.uid(), so app code inserting into its own space need not name
--     either. Writing into a team space means setting space_id explicitly,
--     and the insert policy still decides.
--
-- anon has nothing anywhere. service_role keeps its grants (lib/system only).
--
-- The four SQL functions that took a USER_ID text argument lose it and run
-- as the caller (SECURITY INVOKER), so RLS applies to them too; the Part 2
-- bridge app.personal_space_for_legacy() is dropped. New users get the
-- AI-backed capture features off by default (decision A); Phil's existing
-- row keeps its values.
--
-- Depends on: 0110.
-- Rollback: re-run 0101's DO block to restore deny-all; drop the four
--   policies per table; revoke the grants; drop the column defaults.

-- ---------------------------------------------------------------------
-- 1. Policies, grants, defaults
-- ---------------------------------------------------------------------

do $$
declare
	r          record;
	k          text;
	owner_only boolean;
	rule       text;
begin
	for r in select table_name, section, entity_group from public.entity_groups order by table_name loop
		k := r.section || '.' || r.entity_group;
		owner_only := r.section in ('finance', 'platform');

		execute format('drop policy if exists "deny all" on public.%I', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_select', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_insert', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_update', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_delete', r.table_name);

		if owner_only then
			rule := 'space_id = app.personal_space()';
			execute format('create policy %I on public.%I for select to authenticated using (%s)',
				r.table_name || '_select', r.table_name, rule);
			execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
				r.table_name || '_insert', r.table_name, rule);
			execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
				r.table_name || '_update', r.table_name, rule, rule);
			execute format('create policy %I on public.%I for delete to authenticated using (%s)',
				r.table_name || '_delete', r.table_name, rule);
		else
			execute format('create policy %I on public.%I for select to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
				r.table_name || '_select', r.table_name, k, 'view');
			execute format('create policy %I on public.%I for insert to authenticated with check (space_id in (select app.accessible_spaces(%L, %L)))',
				r.table_name || '_insert', r.table_name, k, 'create_delete');
			execute format('create policy %I on public.%I for update to authenticated using (space_id in (select app.accessible_spaces(%L, %L))) with check (space_id in (select app.accessible_spaces(%L, %L)))',
				r.table_name || '_update', r.table_name, k, 'edit', k, 'edit');
			execute format('create policy %I on public.%I for delete to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
				r.table_name || '_delete', r.table_name, k, 'create_delete');
		end if;

		execute format('grant select, insert, update, delete on public.%I to authenticated', r.table_name);
		execute format('alter table public.%I alter column space_id set default app.personal_space()', r.table_name);
		execute format('alter table public.%I alter column created_by set default auth.uid()', r.table_name);
	end loop;
end
$$;

-- The one view: security_invoker, so the pc_metrics policy applies.
grant select on public.pc_metrics_machines to authenticated;

-- ---------------------------------------------------------------------
-- 2. SQL functions run as the caller, no legacy user argument
-- ---------------------------------------------------------------------

drop function if exists public.search_memory_chunks(extensions.vector, text, integer, double precision);
create or replace function public.search_memory_chunks(
	query_embedding extensions.vector,
	match_count integer default 20,
	similarity_threshold double precision default 0.3
)
returns table (
	id uuid, source_type text, source_id uuid, text text,
	similarity double precision, created_at timestamptz
)
language sql
stable
as $$
	select
		mc.id,
		mc.source_type,
		mc.source_id,
		mc.text,
		1 - (mc.embedding <=> query_embedding) as similarity,
		mc.created_at
	from public.memory_chunks mc
	where 1 - (mc.embedding <=> query_embedding) > similarity_threshold
	order by mc.embedding <=> query_embedding asc
	limit match_count;
$$;

drop function if exists public.spend_by_category(text, date, date);
create or replace function public.spend_by_category(p_start date, p_end date)
returns table (category text, total numeric)
language sql
stable
set search_path = ''
as $$
	select
		coalesce(category, 'Uncategorised') as category,
		sum(debit) as total
	from public.transactions
	where txn_date between p_start and p_end
	  and category is distinct from 'Transfer (internal)'
	  and debit is not null
	group by 1
	order by 2 desc;
$$;

drop function if exists public.spend_by_month(text, integer);
create or replace function public.spend_by_month(p_months_back integer default 6)
returns table (month date, category text, total numeric)
language sql
stable
set search_path = ''
as $$
	select
		date_trunc('month', txn_date)::date as month,
		coalesce(category, 'Uncategorised') as category,
		sum(debit) as total
	from public.transactions
	where txn_date >= date_trunc('month', now()) - (p_months_back - 1) * interval '1 month'
	  and category is distinct from 'Transfer (internal)'
	  and debit is not null
	group by 1, 2
	order by 1 asc, 3 desc;
$$;

drop function if exists public.txn_agg(text, uuid, date, date, text, text[], text[]);
create or replace function public.txn_agg(
	p_account_id uuid default null,
	p_from date default null,
	p_to date default null,
	p_search text default null,
	p_types text[] default null,
	p_categories text[] default null
)
returns json
language sql
stable
set search_path = ''
as $$
	select json_build_object(
		'total_in',  coalesce(sum(case when category is distinct from 'Transfer (internal)' and amount > 0 then amount end), 0),
		'total_out', coalesce(sum(case when category is distinct from 'Transfer (internal)' and amount < 0 then amount end), 0),
		'types',     coalesce(array_agg(distinct txn_type order by txn_type), '{}')
	)
	from public.transactions
	where (p_account_id is null or account_id = p_account_id)
	  and (p_from is null or txn_date >= p_from)
	  and (p_to is null or txn_date <= p_to)
	  and (p_search is null or description ilike '%' || p_search || '%' or enriched_merchant ilike '%' || p_search || '%')
	  and (p_types is null or txn_type = any (p_types))
	  and (p_categories is null or category = any (p_categories));
$$;

grant execute on function public.search_memory_chunks(extensions.vector, integer, double precision) to authenticated, service_role;
grant execute on function public.spend_by_category(date, date) to authenticated, service_role;
grant execute on function public.spend_by_month(integer) to authenticated, service_role;
grant execute on function public.txn_agg(uuid, date, date, text, text[], text[]) to authenticated, service_role;

drop function if exists app.personal_space_for_legacy(text);

-- ---------------------------------------------------------------------
-- 3. AI-backed features default OFF for new users (decision A)
-- ---------------------------------------------------------------------

alter table public.user_settings alter column voice_capture_enabled            set default false;
alter table public.user_settings alter column ai_categorisation_enabled        set default false;
alter table public.user_settings alter column claude_vision_label_scan_enabled set default false;
