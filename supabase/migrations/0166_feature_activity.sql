-- 0166 — when the person last did something in each feature.
--
-- "Gone quiet" (master run §6) needs to know when someone last added or
-- changed something in a feature. That is already recorded: every row has
-- the time it was made, most have the time it was last changed, and every
-- registered table says who made it. So the true history is read from the
-- rows themselves, back to the feature's first day, with no event table to
-- write to and nothing to backfill.
--
-- One call answers for a list of tables: the latest created or updated
-- time among the caller's own rows in each. It runs as the caller, so row
-- security applies and nobody learns anything about anyone else's rows.
-- Only tables in the entity registry are read; any other name is ignored.
--
-- Depends on: 0103 (spaces, created_by on registered tables).

create or replace function public.feature_activity(p_tables text[])
returns table (table_name text, last_at timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
	v_table text;
	v_has_updated boolean;
	v_last timestamptz;
begin
	if auth.uid() is null then
		return;
	end if;
	for v_table in
		select distinct eg.table_name
		from public.entity_groups eg
		where eg.table_name = any (p_tables)
		  and exists (
				select 1 from information_schema.columns c
				where c.table_schema = 'public' and c.table_name = eg.table_name and c.column_name = 'created_by'
			)
		  and exists (
				select 1 from information_schema.columns c
				where c.table_schema = 'public' and c.table_name = eg.table_name and c.column_name = 'created_at'
			)
	loop
		select exists (
			select 1 from information_schema.columns c
			where c.table_schema = 'public' and c.table_name = v_table and c.column_name = 'updated_at'
		) into v_has_updated;
		execute format(
			'select max(%s) from public.%I where created_by = auth.uid()',
			case when v_has_updated then 'greatest(created_at, coalesce(updated_at, created_at))' else 'created_at' end,
			v_table
		) into v_last;
		table_name := v_table;
		last_at := v_last;
		return next;
	end loop;
end
$$;

revoke all on function public.feature_activity(text[]) from public, anon;
grant execute on function public.feature_activity(text[]) to authenticated, service_role;
