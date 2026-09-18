-- 0124_policies_new_tables.sql
-- api_usage (0119), api_tokens (0120) and sprints (0123) were adopted and
-- registered in entity_groups but the 0111 policy + grant loop was never
-- re-run for them (0116 re-ran it for its own tables). RLS was enabled with
-- no policies and no grants, so `authenticated` could not read them — and
-- since TASK_SELECT embeds `sprint:sprints(...)`, every ticket read 500'd on
-- production (2026-09-18). This re-runs the 0111 loop for those three
-- tables only. Idempotent. Depends on: 0123.

do $$
declare
	r          record;
	k          text;
	owner_only boolean;
	rule       text;
begin
	for r in
		select table_name, section, entity_group from public.entity_groups
		where table_name in ('api_usage', 'api_tokens', 'sprints')
		order by table_name
	loop
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
		raise notice 'policies + grants installed on %', r.table_name;
	end loop;
end
$$;
