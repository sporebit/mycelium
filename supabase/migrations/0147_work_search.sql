-- 0147_work_search.sql
-- Work redesign (MYC-174, claude/spec-work.md §3.4) — executing the query
-- object that the filter bar emits and the JQL parser compiles to.
--
--   work_search(p_query, p_limit, p_offset, p_space)
--     SECURITY INVOKER: the caller's RLS decides which tickets exist. The
--     predicate is built from a fixed field → SQL map; every value is
--     quoted with format('%L'); an unknown field, operator or order column
--     raises. Deleted rows, habits (W14) and spawn templates are always
--     excluded. Returns ids in order, each with the total match count.
--
--   Every leaf is wrapped in coalesce(…, false), so NOT and != behave as
--   people expect: `assignee != me` includes the unassigned.
--
--   Values that are literals, not functions (spec §3.2): `me` on assignee
--   / reporter; `today`, `-7d`, `+2w`, `-1m` on dates (Europe/London);
--   `active` on sprint.
-- No tables. Depends on: 0146.

/** A date literal or a relative one, in London. */
create or replace function public.work_date(p_value text)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
	v     text := lower(btrim(coalesce(p_value, '')));
	v_now date := (now() at time zone 'Europe/London')::date;
	m     text[];
begin
	if v in ('today', 'now') then
		return v_now;
	elsif v = 'tomorrow' then
		return v_now + 1;
	elsif v = 'yesterday' then
		return v_now - 1;
	end if;
	m := regexp_match(v, '^([+-])(\d{1,4})([dwmy])$');
	if m is not null then
		return (v_now + ((m[1] || m[2])::int * case m[3]
			when 'd' then interval '1 day'
			when 'w' then interval '1 week'
			when 'm' then interval '1 month'
			else interval '1 year' end))::date;
	end if;
	if v ~ '^\d{4}-\d{2}-\d{2}$' then
		return v::date;
	end if;
	raise exception 'work query: "%" is not a date (use YYYY-MM-DD, today, or a relative date such as -7d)', p_value
		using errcode = '22007';
end
$$;

/** Escape a value for use inside ILIKE '%…%'. */
create or replace function public.work_like(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
	select '%' || replace(replace(replace(coalesce(p_value, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

/** The label field a JQL field name stands for. */
create or replace function public.work_field_kind(p_field text)
returns text
language sql
immutable
set search_path = ''
as $$
	select case lower(p_field)
		when 'project' then 'ref'
		when 'type' then 'ref'
		when 'status' then 'ref'
		when 'assignee' then 'ref'
		when 'reporter' then 'ref'
		when 'component' then 'ref'
		when 'epic' then 'ref'
		when 'sprint' then 'ref'
		when 'key' then 'ref'
		when 'statuscategory' then 'category'
		when 'points' then 'number'
		when 'created' then 'date'
		when 'updated' then 'date'
		when 'started' then 'date'
		when 'resolved' then 'date'
		when 'due' then 'date'
		when 'text' then 'text'
		else 'label'
	end
$$;

/** A label field by slug, as the caller can see it; raises when there is none. */
create or replace function public.work_label_field(p_field text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
	f text := lower(btrim(coalesce(p_field, '')));
begin
	if f = 'label' then
		f := 'labels';
	end if;
	if f !~ '^[a-z][a-z0-9_]{0,31}$'
	   or not exists (select 1 from public.label_fields lf where lf.slug = f) then
		raise exception 'work query: unknown field "%"', p_field using errcode = '22023';
	end if;
	return f;
end
$$;

/** "ticket t matches value v on this field" — exact, or fuzzy for ~. */
create or replace function public.work_match_sql(p_field text, p_value text, p_fuzzy boolean)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
	f     text := lower(p_field);
	v     text := btrim(coalesce(p_value, ''));
	v_cmp text;
begin
	-- name comparison: exact (case-insensitive) or contains
	if p_fuzzy then
		v_cmp := format('ilike %L', public.work_like(v));
	else
		v_cmp := format('= lower(%L)', v);
	end if;

	case f
	when 'project' then
		if p_fuzzy then
			return format('t.project_id in (select p.id from public.projects p where p.name %s or p.prefix %s)', v_cmp, v_cmp);
		end if;
		return format(
			't.project_id in (select p.id from public.projects p where upper(p.prefix) = upper(%1$L) or lower(p.name) = lower(%1$L) or p.id::text = %1$L'
			|| ' or (p.is_default and exists (select 1 from public.spaces s where s.id = p.space_id and upper(s.ticket_prefix) = upper(%1$L))))', v);
	when 'type' then
		if p_fuzzy then
			return format('t.type_id in (select it.id from public.issue_types it where it.name %s)', v_cmp);
		end if;
		return format('t.type_id in (select it.id from public.issue_types it where lower(it.name) = lower(%1$L) or it.slug = lower(%1$L) or it.id::text = %1$L)', v);
	when 'status' then
		if p_fuzzy then
			return format('t.status_id in (select st.id from public.ticket_statuses st where st.name %s)', v_cmp);
		end if;
		return format('t.status_id in (select st.id from public.ticket_statuses st where lower(st.name) = lower(%1$L) or st.id::text = %1$L)', v);
	when 'assignee' then
		if lower(v) = 'me' then
			return 't.assignee_id = (select auth.uid())';
		elsif p_fuzzy then
			return format('t.assignee_id in (select pr.id from public.profiles pr where pr.display_name %s)', v_cmp);
		end if;
		return format('t.assignee_id in (select pr.id from public.profiles pr where lower(pr.display_name) = lower(%1$L) or pr.id::text = %1$L)', v);
	when 'reporter' then
		if lower(v) = 'me' then
			return 't.created_by = (select auth.uid())';
		elsif p_fuzzy then
			return format('t.created_by in (select pr.id from public.profiles pr where pr.display_name %s)', v_cmp);
		end if;
		return format('t.created_by in (select pr.id from public.profiles pr where lower(pr.display_name) = lower(%1$L) or pr.id::text = %1$L)', v);
	when 'component' then
		if p_fuzzy then
			return format('exists (select 1 from public.ticket_components tc join public.components c on c.id = tc.component_id where tc.ticket_id = t.id and c.name %s)', v_cmp);
		end if;
		return format('exists (select 1 from public.ticket_components tc join public.components c on c.id = tc.component_id where tc.ticket_id = t.id and (lower(c.name) = lower(%1$L) or c.id::text = %1$L))', v);
	when 'epic' then
		if p_fuzzy then
			return format('t.epic_id in (select e.id from public.tickets e where e.title %s or e.ticket_key %s)', v_cmp, v_cmp);
		end if;
		return format('t.epic_id in (select e.id from public.tickets e where e.ticket_key = upper(%1$L) or upper(%1$L) = any(e.key_aliases) or lower(e.title) = lower(%1$L) or e.id::text = %1$L)', v);
	when 'sprint' then
		if lower(v) in ('active', 'open') then
			return 't.sprint_id in (select sp.id from public.sprints sp where sp.status = ''active'')';
		elsif p_fuzzy then
			return format('t.sprint_id in (select sp.id from public.sprints sp where sp.name %s)', v_cmp);
		end if;
		return format('t.sprint_id in (select sp.id from public.sprints sp where lower(sp.name) = lower(%1$L) or sp.id::text = %1$L)', v);
	when 'key' then
		if p_fuzzy then
			return format('t.ticket_key %s', v_cmp);
		end if;
		return format('(t.ticket_key = upper(%1$L) or upper(%1$L) = any(t.key_aliases))', v);
	else
		-- a label field, by slug; `label` is the Labels field
		f := public.work_label_field(p_field);
		if p_fuzzy then
			return format('exists (select 1 from public.ticket_labels tl join public.labels l on l.id = tl.label_id join public.label_fields lf on lf.id = l.field_id'
				|| ' where tl.ticket_id = t.id and lf.slug = %L and l.name %s)', f, v_cmp);
		end if;
		return format('exists (select 1 from public.ticket_labels tl join public.labels l on l.id = tl.label_id join public.label_fields lf on lf.id = l.field_id'
			|| ' where tl.ticket_id = t.id and lf.slug = %L and l.slug = public.work_label_slug(%L))', f, v);
	end case;
end
$$;

/** "this field is empty on ticket t". */
create or replace function public.work_empty_sql(p_field text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
	f text := lower(p_field);
begin
	case f
	when 'project' then return 't.project_id is null';
	when 'type' then return 't.type_id is null';
	when 'status' then return 't.status_id is null';
	when 'assignee' then return 't.assignee_id is null';
	when 'reporter' then return 't.created_by is null';
	when 'epic' then return 't.epic_id is null';
	when 'sprint' then return 't.sprint_id is null';
	when 'key' then return 't.ticket_key is null';
	when 'points' then return 't.points is null';
	when 'created' then return 't.created_at is null';
	when 'updated' then return 't.updated_at is null';
	when 'started' then return 't.started_at is null';
	when 'resolved' then return 't.resolved_at is null';
	when 'due' then return 'coalesce(t.deadline_on, t.due_date) is null';
	when 'text' then return '(coalesce(t.description, '''') = '''')';
	when 'statuscategory' then return 't.status_id is null';
	when 'component' then return 'not exists (select 1 from public.ticket_components tc where tc.ticket_id = t.id)';
	else
		f := public.work_label_field(p_field);
		return format('not exists (select 1 from public.ticket_labels tl join public.labels l on l.id = tl.label_id join public.label_fields lf on lf.id = l.field_id'
			|| ' where tl.ticket_id = t.id and lf.slug = %L)', f);
	end case;
end
$$;

create or replace function public.work_leaf_sql(p_field text, p_cmp text, p_value jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
	f       text := lower(btrim(coalesce(p_field, '')));
	c       text := lower(btrim(coalesce(p_cmp, '')));
	v_kind  text := public.work_field_kind(f);
	v_vals  text[];
	v_one   text;
	v_expr  text;
	v_parts text[] := '{}';
	v_sql   text;
begin
	if f = '' then
		raise exception 'work query: a clause needs a field' using errcode = '22023';
	end if;
	if c not in ('=', '!=', 'in', 'not in', '~', '<', '>', '<=', '>=', 'is empty', 'is not empty') then
		raise exception 'work query: unknown operator "%"', p_cmp using errcode = '22023';
	end if;

	if c = 'is empty' then
		return '(' || public.work_empty_sql(f) || ')';
	elsif c = 'is not empty' then
		return '(not (' || public.work_empty_sql(f) || '))';
	end if;

	-- the value(s)
	if p_value is null or jsonb_typeof(p_value) = 'null' then
		raise exception 'work query: "%" needs a value', f using errcode = '22023';
	elsif jsonb_typeof(p_value) = 'array' then
		select array_agg(x #>> '{}') into v_vals from jsonb_array_elements(p_value) as x;
	elsif jsonb_typeof(p_value) in ('string', 'number') then
		v_vals := array[p_value #>> '{}'];
	else
		raise exception 'work query: "%" has a value of the wrong shape', f using errcode = '22023';
	end if;
	if v_vals is null or array_length(v_vals, 1) is null then
		raise exception 'work query: "%" needs at least one value', f using errcode = '22023';
	end if;
	if array_length(v_vals, 1) > 100 then
		raise exception 'work query: too many values for "%"', f using errcode = '22023';
	end if;
	if c in ('in', 'not in') then
		null;
	elsif array_length(v_vals, 1) > 1 then
		raise exception 'work query: "% %" takes one value', f, c using errcode = '22023';
	end if;

	if v_kind = 'text' then
		if c <> '~' then
			raise exception 'work query: text only supports ~' using errcode = '22023';
		end if;
		v_one := public.work_like(v_vals[1]);
		return format('(coalesce(t.title ilike %1$L or t.description ilike %1$L or t.ticket_key ilike %1$L or exists (select 1 from unnest(t.key_aliases) a where a ilike %1$L), false))', v_one);
	end if;

	if v_kind in ('number', 'date') then
		if c = '~' then
			raise exception 'work query: "%" does not support ~', f using errcode = '22023';
		end if;
		v_expr := case f
			when 'points' then 't.points'
			when 'created' then '(t.created_at at time zone ''Europe/London'')::date'
			when 'updated' then '(t.updated_at at time zone ''Europe/London'')::date'
			when 'started' then '(t.started_at at time zone ''Europe/London'')::date'
			when 'resolved' then '(t.resolved_at at time zone ''Europe/London'')::date'
			when 'due' then 'coalesce(t.deadline_on, t.due_date)'
		end;
		foreach v_one in array v_vals loop
			if v_kind = 'number' then
				if v_one !~ '^-?\d+(\.\d+)?$' then
					raise exception 'work query: "%" is not a number', v_one using errcode = '22023';
				end if;
				v_parts := v_parts || format('%L::numeric', v_one);
			else
				-- validated now, evaluated when the query runs
				perform public.work_date(v_one);
				v_parts := v_parts || format('public.work_date(%L)', v_one);
			end if;
		end loop;
		v_sql := case c
			when 'in' then format('%s in (%s)', v_expr, array_to_string(v_parts, ', '))
			when 'not in' then format('not coalesce(%s in (%s), false)', v_expr, array_to_string(v_parts, ', '))
			when '!=' then format('not coalesce(%s = %s, false)', v_expr, v_parts[1])
			else format('%s %s %s', v_expr, c, v_parts[1])
		end;
		return '(coalesce(' || v_sql || ', false))';
	end if;

	if c in ('<', '>', '<=', '>=') then
		raise exception 'work query: "%" does not support %', f, c using errcode = '22023';
	end if;

	if v_kind = 'category' then
		if c = '~' then
			raise exception 'work query: statusCategory does not support ~' using errcode = '22023';
		end if;
		foreach v_one in array v_vals loop
			v_one := replace(replace(lower(btrim(v_one)), ' ', '_'), '-', '_');
			v_one := case v_one when 'to_do' then 'todo' when 'inprogress' then 'in_progress' when 'doing' then 'in_progress' else v_one end;
			if v_one not in ('todo', 'in_progress', 'done') then
				raise exception 'work query: statusCategory is one of To Do, In Progress, Done' using errcode = '22023';
			end if;
			v_parts := v_parts || quote_literal(v_one);
		end loop;
		v_sql := format('exists (select 1 from public.ticket_statuses st where st.id = t.status_id and st.status_category in (%s))', array_to_string(v_parts, ', '));
		if c in ('!=', 'not in') then
			return '(not coalesce(' || v_sql || ', false))';
		end if;
		return '(coalesce(' || v_sql || ', false))';
	end if;

	-- ref and label fields
	foreach v_one in array v_vals loop
		v_parts := v_parts || ('coalesce(' || public.work_match_sql(f, v_one, c = '~') || ', false)');
	end loop;
	v_sql := '(' || array_to_string(v_parts, ' or ') || ')';
	if c in ('!=', 'not in') then
		return '(not ' || v_sql || ')';
	end if;
	return v_sql;
end
$$;

create or replace function public.work_query_sql(p_node jsonb, p_depth int default 0)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
	v_op    text;
	v_child jsonb;
	v_parts text[] := '{}';
begin
	if p_node is null or jsonb_typeof(p_node) <> 'object' then
		raise exception 'work query: a node must be an object' using errcode = '22023';
	end if;
	if p_depth > 12 then
		raise exception 'work query: nested too deeply' using errcode = '22023';
	end if;
	v_op := lower(p_node ->> 'op');

	if v_op in ('and', 'or') then
		if jsonb_typeof(p_node -> 'nodes') is distinct from 'array' or jsonb_array_length(p_node -> 'nodes') = 0 then
			raise exception 'work query: "%" needs at least one clause', v_op using errcode = '22023';
		end if;
		if jsonb_array_length(p_node -> 'nodes') > 60 then
			raise exception 'work query: too many clauses' using errcode = '22023';
		end if;
		for v_child in select x from jsonb_array_elements(p_node -> 'nodes') as x loop
			v_parts := v_parts || public.work_query_sql(v_child, p_depth + 1);
		end loop;
		return '(' || array_to_string(v_parts, case v_op when 'and' then ' and ' else ' or ' end) || ')';
	elsif v_op = 'not' then
		return '(not ' || public.work_query_sql(p_node -> 'node', p_depth + 1) || ')';
	elsif v_op is not null then
		raise exception 'work query: unknown op "%"', v_op using errcode = '22023';
	end if;

	return public.work_leaf_sql(p_node ->> 'field', p_node ->> 'cmp', p_node -> 'value');
end
$$;

create or replace function public.work_order_sql(p_order jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
	o       jsonb;
	v_field text;
	v_dir   text;
	v_expr  text;
	v_parts text[] := '{}';
begin
	if p_order is not null and jsonb_typeof(p_order) = 'array' then
		if jsonb_array_length(p_order) > 5 then
			raise exception 'work query: too many ORDER BY fields' using errcode = '22023';
		end if;
		for o in select x from jsonb_array_elements(p_order) as x loop
			v_field := lower(btrim(coalesce(o ->> 'field', '')));
			v_dir := lower(btrim(coalesce(o ->> 'dir', 'asc')));
			if v_dir not in ('asc', 'desc') then
				raise exception 'work query: ORDER BY direction is ASC or DESC' using errcode = '22023';
			end if;
			v_expr := case v_field
				when 'created' then 't.created_at'
				when 'updated' then 't.updated_at'
				when 'started' then 't.started_at'
				when 'resolved' then 't.resolved_at'
				when 'due' then 'coalesce(t.deadline_on, t.due_date)'
				when 'points' then 't.points'
				when 'rank' then 't.sort_order'
				when 'key' then 'split_part(t.ticket_key, ''-'', 1) ' || v_dir || ' nulls last, t.seq'
				when 'title' then 'lower(t.title)'
				when 'summary' then 'lower(t.title)'
				when 'status' then '(select st.sort_order from public.ticket_statuses st where st.id = t.status_id)'
				when 'statuscategory' then '(select case st.status_category when ''todo'' then 1 when ''in_progress'' then 2 else 3 end from public.ticket_statuses st where st.id = t.status_id)'
				when 'type' then '(select it.sort_order from public.issue_types it where it.id = t.type_id)'
				when 'project' then '(select lower(p.name) from public.projects p where p.id = t.project_id)'
				when 'assignee' then '(select lower(pr.display_name) from public.profiles pr where pr.id = t.assignee_id)'
				when 'reporter' then '(select lower(pr.display_name) from public.profiles pr where pr.id = t.created_by)'
				when 'sprint' then '(select sp.starts_on from public.sprints sp where sp.id = t.sprint_id)'
				when 'epic' then '(select e.seq from public.tickets e where e.id = t.epic_id)'
			end;
			if v_expr is null then
				raise exception 'work query: cannot ORDER BY "%"', v_field using errcode = '22023';
			end if;
			v_parts := v_parts || (v_expr || ' ' || v_dir || ' nulls last');
		end loop;
	end if;
	if array_length(v_parts, 1) is null then
		v_parts := array['t.created_at desc nulls last'];
	end if;
	return array_to_string(v_parts || 't.id'::text, ', ');
end
$$;

create or replace function public.work_search(
	p_query  jsonb,
	p_limit  int default 50,
	p_offset int default 0,
	p_space  uuid default null
)
returns table (ticket_id uuid, total bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
	v_where text := '';
	v_sql   text;
begin
	if p_query is not null and jsonb_typeof(p_query) <> 'object' then
		raise exception 'work query: the query must be an object' using errcode = '22023';
	end if;
	if p_query is not null and p_query ? 'where' and jsonb_typeof(p_query -> 'where') = 'object' then
		v_where := ' and ' || public.work_query_sql(p_query -> 'where');
	end if;
	if p_space is not null then
		v_where := v_where || format(' and t.space_id = %L', p_space);
	end if;

	v_sql := 'select t.id, count(*) over () from public.tickets t'
		|| ' where t.deleted_at is null'
		|| ' and coalesce(t.kind, ''task'') <> ''habit'''
		|| ' and (t.recurrence_mode is null or t.recurrence_mode <> ''spawn'' or t.series_id is not null)'
		|| v_where
		|| ' order by ' || public.work_order_sql(case when p_query is null then null else p_query -> 'orderBy' end)
		|| format(' limit %s offset %s', least(greatest(coalesce(p_limit, 50), 1), 1000), greatest(coalesce(p_offset, 0), 0));
	return query execute v_sql;
end
$$;

revoke all on function public.work_date(text) from public;
revoke all on function public.work_like(text) from public;
revoke all on function public.work_field_kind(text) from public;
revoke all on function public.work_label_field(text) from public;
revoke all on function public.work_match_sql(text, text, boolean) from public;
revoke all on function public.work_empty_sql(text) from public;
revoke all on function public.work_leaf_sql(text, text, jsonb) from public;
revoke all on function public.work_query_sql(jsonb, int) from public;
revoke all on function public.work_order_sql(jsonb) from public;
revoke all on function public.work_search(jsonb, int, int, uuid) from public;
grant execute on function public.work_date(text) to authenticated, service_role;
grant execute on function public.work_like(text) to authenticated, service_role;
grant execute on function public.work_field_kind(text) to authenticated, service_role;
grant execute on function public.work_label_field(text) to authenticated, service_role;
grant execute on function public.work_match_sql(text, text, boolean) to authenticated, service_role;
grant execute on function public.work_empty_sql(text) to authenticated, service_role;
grant execute on function public.work_leaf_sql(text, text, jsonb) to authenticated, service_role;
grant execute on function public.work_query_sql(jsonb, int) to authenticated, service_role;
grant execute on function public.work_order_sql(jsonb) to authenticated, service_role;
grant execute on function public.work_search(jsonb, int, int, uuid) to authenticated, service_role;
-- the label helper is called inside the invoker's query
grant execute on function public.work_label_slug(text) to authenticated, service_role;
