-- 0122_project_keys.sql
-- Per-project ticket keys (spec §4.4 trigger (a), Q11, Q26). Until now the
-- key trigger stamped the SPACE prefix on every ticket, so everything was
-- MYC-n. Now:
--   • a ticket in a project whose ROOT project has a prefix takes that
--     prefix and the root's own sequence (sub-projects share the root's);
--   • an unprojected ticket, or one in a project without a prefix, takes the
--     space prefix — the personal space is `PW` from here (Q26);
--   • keys are assigned on insert only, never changed on move (stable keys);
--   • a collision (a prefix adopted mid-way) advances the sequence instead
--     of failing.
-- Existing keys are untouched: the 79 unprojected MYC-n stay MYC-n, and the
-- Mycelium project continues the MYC numbering from the space's counter.
-- The other prefixes follow the map Phil accepted (spec §13.2, Q36):
-- DropShipAuto → DSA, Home Improvement → GARDN, Surprise-Packs → CARDS,
-- Ye – Madrid 2026 → MADRD; Selling (not in the map) → SELL.
-- Depends on: 0121.

create or replace function public.tickets_assign_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_prefix text;
	v_seq    int;
	v_root   uuid;
	v_key    text;
begin
	if new.ticket_key is not null then
		return new;
	end if;

	if new.project_id is not null then
		select coalesce(p.parent_id, p.id) into v_root from public.projects p where p.id = new.project_id;
		select prefix into v_prefix from public.projects where id = v_root for update;
		if v_prefix is not null then
			loop
				select next_seq into v_seq from public.projects where id = v_root;
				update public.projects set next_seq = v_seq + 1 where id = v_root;
				v_key := v_prefix || '-' || v_seq;
				exit when not exists (select 1 from public.tickets t where t.space_id = new.space_id and t.ticket_key = v_key);
			end loop;
			new.seq := v_seq;
			new.ticket_key := v_key;
			return new;
		end if;
	end if;

	select ticket_prefix, next_seq into v_prefix, v_seq from public.spaces where id = new.space_id for update;
	if v_prefix is null then
		v_prefix := 'TKT';
	end if;
	loop
		v_key := v_prefix || '-' || v_seq;
		exit when not exists (select 1 from public.tickets t where t.space_id = new.space_id and t.ticket_key = v_key);
		v_seq := v_seq + 1;
	end loop;
	update public.spaces set next_seq = v_seq + 1 where id = new.space_id;
	new.seq := v_seq;
	new.ticket_key := v_key;
	return new;
end
$$;
revoke all on function public.tickets_assign_key() from public;

-- Mycelium keeps MYC and continues the space's counter; the personal space
-- moves to PW for unprojected tickets (fresh counter, no collision possible).
do $$
declare
	s record;
begin
	for s in select id, next_seq from public.spaces where kind = 'personal' and ticket_prefix = 'MYC' loop
		update public.projects set prefix = 'MYC', next_seq = s.next_seq
		where space_id = s.id and lower(name) = 'mycelium' and prefix is null;
		update public.spaces set ticket_prefix = 'PW', next_seq = 1 where id = s.id;
	end loop;
end
$$;

update public.projects set prefix = 'DSA'   where prefix is null and lower(name) = 'dropshipauto';
update public.projects set prefix = 'GARDN' where prefix is null and lower(name) = 'home improvement';
update public.projects set prefix = 'CARDS' where prefix is null and lower(name) = 'surprise-packs';
update public.projects set prefix = 'MADRD' where prefix is null and lower(name) like 'ye - madrid%';
update public.projects set prefix = 'SELL'  where prefix is null and lower(name) = 'selling';
