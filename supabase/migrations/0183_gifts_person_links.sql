-- 0183: the gifts tables (0181) link to People through person_id / for_person_id
-- without the promote-on-link trigger every such link carries (0140 §6, 0167):
-- the trigger refuses a person from another space and promotes a linked
-- contact to a person. Wired here the way 0140 wires every link table, so
-- lib/access/personLinks.test.ts ("the rule is on every table that links to
-- a person") holds again. Idempotent.
do $$
declare
	r record;
begin
	for r in select * from public.people_link_tables() l
		where l.table_name in ('gift_occasions', 'gift_bundles', 'gifts')
	loop
		execute format('drop trigger if exists %I on public.%I', 'promote_on_link_' || r.column_name, r.table_name);
		execute format('create trigger %I after insert or update of %I on public.%I for each row execute function public.people_promote_on_link(%L)',
			'promote_on_link_' || r.column_name, r.column_name, r.table_name, r.column_name);
		raise notice '0183: promote-on-link trigger on %.%', r.table_name, r.column_name;
	end loop;
end
$$;
