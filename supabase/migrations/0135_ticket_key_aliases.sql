-- 0135_ticket_key_aliases.sql
-- Re-key on first project + MYC clean-up (MYC-150; spec §4.4 trigger (a), Q26).
-- Follow-up to 0122. Rule (Phil, 2026-09-23): `MYC-` is for the Mycelium
-- project only. A ticket keyed with the SPACE prefix (`PW-n`) is re-keyed the
-- first time it is put in a project whose root has a prefix (PW-14 → DSA-3);
-- the old key is kept in `key_aliases` and keeps resolving everywhere
-- (/api/tickets/[key], ⌘K, tix, GitHub commit matching). Once a ticket
-- carries a project key it is stable on every later move (0122 unchanged).
--
--   • tickets.key_aliases text[]  — every key this row has ever had, oldest first
--   • tickets_take_key()          — one sequence taker for both triggers; a key
--                                   is never reused while it is live OR an alias
--   • tickets_assign_key()        — insert trigger, now via tickets_take_key()
--   • tickets_rekey_on_project()  — before update of project_id
--   • one-off: every MYC-n ticket whose root project is not Mycelium (the 79
--     unprojected ones incl. the habit series MYC-97…108, and the handful that
--     sit in GARDN / SELL / MADRD) takes its project's prefix or PW-n; the old
--     key becomes an alias. Mycelium's own MYC-n keys are untouched.
-- Depends on: 0122.

alter table public.tickets
	add column if not exists key_aliases text[] not null default '{}';
create index if not exists tickets_key_aliases_gin on public.tickets using gin (key_aliases);

-- ---------------------------------------------------------------------
-- The sequence taker. p_root null → the space's prefix + counter.
-- ---------------------------------------------------------------------
create or replace function public.tickets_take_key(p_space uuid, p_root uuid, out o_key text, out o_seq int)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_prefix text;
	v_seq    int;
begin
	if p_root is not null then
		select prefix into v_prefix from public.projects where id = p_root for update;
	end if;
	if v_prefix is not null then
		loop
			select next_seq into v_seq from public.projects where id = p_root;
			update public.projects set next_seq = v_seq + 1 where id = p_root;
			o_key := v_prefix || '-' || v_seq;
			exit when not exists (
				select 1 from public.tickets t
				where t.space_id = p_space and (t.ticket_key = o_key or o_key = any(t.key_aliases))
			);
		end loop;
		o_seq := v_seq;
		return;
	end if;

	select ticket_prefix, next_seq into v_prefix, v_seq from public.spaces where id = p_space for update;
	if v_prefix is null then
		v_prefix := 'TKT';
	end if;
	loop
		o_key := v_prefix || '-' || v_seq;
		exit when not exists (
			select 1 from public.tickets t
			where t.space_id = p_space and (t.ticket_key = o_key or o_key = any(t.key_aliases))
		);
		v_seq := v_seq + 1;
	end loop;
	update public.spaces set next_seq = v_seq + 1 where id = p_space;
	o_seq := v_seq;
end
$$;
revoke all on function public.tickets_take_key(uuid, uuid) from public;

-- ---------------------------------------------------------------------
-- Insert: same behaviour as 0122, through the shared taker.
-- ---------------------------------------------------------------------
create or replace function public.tickets_assign_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_root uuid;
	v_key  text;
	v_seq  int;
begin
	if new.ticket_key is not null then
		return new;
	end if;
	if new.project_id is not null then
		select coalesce(p.parent_id, p.id) into v_root from public.projects p where p.id = new.project_id;
	end if;
	select o_key, o_seq into v_key, v_seq from public.tickets_take_key(new.space_id, v_root);
	new.ticket_key := v_key;
	new.seq := v_seq;
	return new;
end
$$;
revoke all on function public.tickets_assign_key() from public;

-- ---------------------------------------------------------------------
-- Update of project_id: a space-keyed ticket takes its first project key.
-- "Space-keyed" = the key's prefix is the space's ticket_prefix, i.e. the
-- ticket has never carried a project prefix. Anything else is stable.
-- ---------------------------------------------------------------------
create or replace function public.tickets_rekey_on_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_space_prefix text;
	v_cur_prefix   text;
	v_root         uuid;
	v_prefix       text;
	v_key          text;
	v_seq          int;
begin
	if new.project_id is null or new.project_id is not distinct from old.project_id or new.ticket_key is null then
		return new;
	end if;
	select ticket_prefix into v_space_prefix from public.spaces where id = new.space_id;
	v_cur_prefix := split_part(new.ticket_key, '-', 1);
	if v_space_prefix is null or v_cur_prefix <> v_space_prefix then
		return new;   -- already project-keyed: stable on move
	end if;
	select coalesce(p.parent_id, p.id) into v_root from public.projects p where p.id = new.project_id;
	select prefix into v_prefix from public.projects where id = v_root;
	if v_prefix is null or v_prefix = v_cur_prefix then
		return new;   -- project without a prefix keeps the space key
	end if;
	select o_key, o_seq into v_key, v_seq from public.tickets_take_key(new.space_id, v_root);
	new.key_aliases := array_append(array_remove(coalesce(new.key_aliases, '{}'), new.ticket_key), new.ticket_key);
	new.ticket_key := v_key;
	new.seq := v_seq;
	return new;
end
$$;
revoke all on function public.tickets_rekey_on_project() from public;

drop trigger if exists tickets_rekey_on_project on public.tickets;
create trigger tickets_rekey_on_project
	before update of project_id on public.tickets
	for each row execute function public.tickets_rekey_on_project();

-- ---------------------------------------------------------------------
-- One-off clean-up. In any space where MYC is a PROJECT prefix, a MYC-n key
-- on a ticket whose root project is not that project is a 0116-era
-- space key: re-key it (project prefix if it has one, else the space's),
-- oldest first so the new numbering follows creation order.
-- ---------------------------------------------------------------------
do $$
declare
	t        record;
	v_root   uuid;
	v_prefix text;
	v_key    text;
	v_seq    int;
	n        int := 0;
begin
	for t in
		select tk.id, tk.space_id, tk.project_id, tk.ticket_key
		from public.tickets tk
		where tk.ticket_key like 'MYC-%'
		  and exists (select 1 from public.projects p where p.space_id = tk.space_id and p.prefix = 'MYC')
		order by tk.seq nulls last, tk.created_at
	loop
		v_root := null;
		v_prefix := null;
		if t.project_id is not null then
			select coalesce(p.parent_id, p.id) into v_root from public.projects p where p.id = t.project_id;
			select prefix into v_prefix from public.projects where id = v_root;
		end if;
		if v_prefix = 'MYC' then
			continue;   -- Mycelium work keeps its key
		end if;
		if v_prefix is null then
			v_root := null;   -- unprojected, or a project without a prefix → space key
		end if;
		select o_key, o_seq into v_key, v_seq from public.tickets_take_key(t.space_id, v_root);
		update public.tickets
		set ticket_key = v_key,
		    seq = v_seq,
		    key_aliases = array_append(array_remove(key_aliases, t.ticket_key), t.ticket_key)
		where id = t.id;
		n := n + 1;
	end loop;
	raise notice '0135: re-keyed % MYC-n tickets outside the Mycelium project', n;
end
$$;
