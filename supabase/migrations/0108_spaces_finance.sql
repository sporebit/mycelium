-- Migration: space_id + created_by on the finance section. P12 Part 2.
-- See 0104 for what app.adopt_table does.
--
-- Finance is owner-only by decision: Part 3's policies test
-- space_id = app.personal_space() and never the sharing helper, and
-- user_grants carries a check (section <> 'finance'). Nothing here differs
-- structurally from the other sections; the difference is entirely in the
-- policies to come.
--
-- The three finance SQL functions filtered on user_id; they now filter on
-- the legacy user's personal space so their existing callers keep working
-- until Part 3 rewrites them to auth.uid(). spend_by_* are SECURITY
-- DEFINER as before.
--
-- Depends on: 0103.
-- Rollback: restore from the pre-cutover dump.

-- banking
select app.adopt_table('bank_accounts');
select app.adopt_table('transactions');
select app.adopt_table('paypal_payments');

-- investments
select app.adopt_table('investments');

-- subscriptions (the recurring-cost ledger)
select app.adopt_table('accounts');

create or replace function public.spend_by_category(p_user_id text, p_start date, p_end date)
returns table (category text, total numeric)
language sql
security definer
set search_path = ''
as $$
	select
		coalesce(category, 'Uncategorised') as category,
		sum(debit) as total
	from public.transactions
	where space_id = app.personal_space_for_legacy(p_user_id)
	  and txn_date between p_start and p_end
	  and category is distinct from 'Transfer (internal)'
	  and debit is not null
	group by 1
	order by 2 desc;
$$;

create or replace function public.spend_by_month(p_user_id text, p_months_back integer default 6)
returns table (month date, category text, total numeric)
language sql
security definer
set search_path = ''
as $$
	select
		date_trunc('month', txn_date)::date as month,
		coalesce(category, 'Uncategorised') as category,
		sum(debit) as total
	from public.transactions
	where space_id = app.personal_space_for_legacy(p_user_id)
	  and txn_date >= date_trunc('month', now()) - (p_months_back - 1) * interval '1 month'
	  and category is distinct from 'Transfer (internal)'
	  and debit is not null
	group by 1, 2
	order by 1 asc, 3 desc;
$$;

create or replace function public.txn_agg(
	p_user_id text,
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
	where space_id = app.personal_space_for_legacy(p_user_id)
	  and (p_account_id is null or account_id = p_account_id)
	  and (p_from is null or txn_date >= p_from)
	  and (p_to is null or txn_date <= p_to)
	  and (p_search is null or description ilike '%' || p_search || '%' or enriched_merchant ilike '%' || p_search || '%')
	  and (p_types is null or txn_type = any (p_types))
	  and (p_categories is null or category = any (p_categories));
$$;
