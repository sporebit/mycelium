-- 0140_people_contacts.sql
-- People contacts (claude/people-contacts-spec.md, MYC-165): a contact tier,
-- soft delete + merge on people; numbers, emails and raw vCards in their own
-- tables; import batches with a review list; the promote-on-link trigger over
-- every FK to people.id; the merge function that walks pg_constraint at run
-- time; the bin purge. New tables are adopted into spaces under
-- organisation.people with the 0111 policy + grant loop inlined (the 0124
-- lesson). Depends on: 0139.

-- ---------------------------------------------------------------------
-- 1. people: tier, soft delete, merge pointer
-- ---------------------------------------------------------------------
alter table public.people
	add column if not exists tier            text not null default 'person' check (tier in ('person', 'contact')),
	add column if not exists deleted_at      timestamptz,
	add column if not exists merged_into_id  uuid references public.people(id) on delete set null,
	add column if not exists promoted_at     timestamptz;
create index if not exists people_live_tier_idx on public.people (space_id, tier) where deleted_at is null;
create index if not exists people_deleted_idx on public.people (deleted_at) where deleted_at is not null;
create index if not exists people_merged_into_idx on public.people (merged_into_id) where merged_into_id is not null;

-- ---------------------------------------------------------------------
-- 2. numbers, emails, raw vCards, import batches + candidates
-- ---------------------------------------------------------------------
create table if not exists public.person_phones (
	id                 uuid primary key default gen_random_uuid(),
	person_id          uuid not null references public.people(id) on delete cascade,
	number_raw         text not null,
	number_e164        text,
	-- one row per distinct number per person: the E.164 form, else the digits typed
	number_key         text generated always as (coalesce(number_e164, regexp_replace(lower(number_raw), '[^0-9a-z+]', '', 'g'))) stored,
	label              text,
	is_current         boolean not null default true,
	include_in_export  boolean not null default true,
	sort_order         int not null default 0,
	created_at         timestamptz not null default now(),
	updated_at         timestamptz not null default now(),
	constraint person_phones_one_per_number unique (person_id, number_key)
);
create index if not exists person_phones_e164_idx on public.person_phones (number_e164) where number_e164 is not null;

create table if not exists public.person_emails (
	id                 uuid primary key default gen_random_uuid(),
	person_id          uuid not null references public.people(id) on delete cascade,
	email              text not null,
	email_key          text generated always as (lower(btrim(email))) stored,
	label              text,
	is_current         boolean not null default true,
	include_in_export  boolean not null default true,
	sort_order         int not null default 0,
	created_at         timestamptz not null default now(),
	updated_at         timestamptz not null default now(),
	constraint person_emails_one_per_address unique (person_id, email_key)
);
create index if not exists person_emails_key_idx on public.person_emails (email_key);

create table if not exists public.person_vcards (
	id           uuid primary key default gen_random_uuid(),
	person_id    uuid not null references public.people(id) on delete cascade,
	uid          text not null,
	raw          text not null,
	version      text,
	batch_id     uuid,
	imported_at  timestamptz not null default now()
);

create table if not exists public.people_import_batches (
	id           uuid primary key default gen_random_uuid(),
	filename     text,
	card_count   int not null default 0,
	imported     int not null default 0,
	review       int not null default 0,
	skipped      int not null default 0,
	failed       int not null default 0,
	status       text not null default 'running' check (status in ('running', 'done', 'failed')),
	created_at   timestamptz not null default now(),
	finished_at  timestamptz
);

create table if not exists public.people_import_candidates (
	id                 uuid primary key default gen_random_uuid(),
	batch_id           uuid not null references public.people_import_batches(id) on delete cascade,
	card_index         int not null,
	uid                text,
	raw                text not null,
	parsed             jsonb not null,
	match_person_id    uuid references public.people(id) on delete set null,
	match_reason       text,
	match_score        numeric,
	decision           text not null default 'pending' check (decision in ('pending', 'merged', 'separate', 'skipped')),
	decided_at         timestamptz,
	created_person_id  uuid references public.people(id) on delete set null,
	created_at         timestamptz not null default now()
);
create index if not exists people_import_candidates_batch_idx on public.people_import_candidates (batch_id, decision);

-- ---------------------------------------------------------------------
-- 3. move phone / email off people (C5), with count assertions
-- ---------------------------------------------------------------------
select app.adopt_table('person_phones', 'people', 'person_id');
select app.adopt_table('person_emails', 'people', 'person_id');
select app.adopt_table('person_vcards', 'people', 'person_id');
select app.adopt_table('people_import_batches');
select app.adopt_table('people_import_candidates', 'people_import_batches', 'batch_id');

alter table public.person_vcards add constraint person_vcards_one_per_uid unique (space_id, uid);

do $$
declare
	n_phone bigint;
	n_email bigint;
	moved   bigint;
begin
	select count(*) into n_phone from public.people where phone is not null and btrim(phone) <> '';
	insert into public.person_phones (person_id, number_raw, number_e164, label, space_id, created_by)
	select
		id,
		btrim(phone),
		-- UK-shaped numbers only; anything else stays raw until the app re-normalises it
		case
			when regexp_replace(phone, '[^0-9+]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$' then regexp_replace(phone, '[^0-9+]', '', 'g')
			when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^0[1-9][0-9]{9}$' then '+44' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 2)
			when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^44[1-9][0-9]{9}$' then '+' || regexp_replace(phone, '[^0-9]', '', 'g')
			else null
		end,
		'mobile',
		space_id,
		created_by
	from public.people
	where phone is not null and btrim(phone) <> ''
	on conflict (person_id, number_key) do nothing;
	get diagnostics moved = row_count;
	if moved <> n_phone then
		raise exception '0140: expected % phone rows to move, moved %', n_phone, moved;
	end if;

	select count(*) into n_email from public.people where email is not null and btrim(email) <> '';
	insert into public.person_emails (person_id, email, label, space_id, created_by)
	select id, btrim(email), 'home', space_id, created_by
	from public.people
	where email is not null and btrim(email) <> ''
	on conflict (person_id, email_key) do nothing;
	get diagnostics moved = row_count;
	if moved <> n_email then
		raise exception '0140: expected % email rows to move, moved %', n_email, moved;
	end if;

	raise notice '0140: moved % phones and % emails off people', n_phone, n_email;
end
$$;

alter table public.people drop column if exists phone;
alter table public.people drop column if exists email;

-- ---------------------------------------------------------------------
-- 4. RLS: enable, register under organisation.people, the 0111 loop, service_role
-- ---------------------------------------------------------------------
alter table public.person_phones enable row level security;
alter table public.person_emails enable row level security;
alter table public.person_vcards enable row level security;
alter table public.people_import_batches enable row level security;
alter table public.people_import_candidates enable row level security;

insert into public.entity_groups (table_name, section, entity_group) values
	('person_phones', 'organisation', 'people'),
	('person_emails', 'organisation', 'people'),
	('person_vcards', 'organisation', 'people'),
	('people_import_batches', 'organisation', 'people'),
	('people_import_candidates', 'organisation', 'people')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

do $$
declare
	r    record;
	k    text;
begin
	for r in select table_name, section, entity_group from public.entity_groups
		where table_name in ('person_phones', 'person_emails', 'person_vcards', 'people_import_batches', 'people_import_candidates') loop
		k := r.section || '.' || r.entity_group;
		execute format('drop policy if exists "deny all" on public.%I', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_select', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_insert', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_update', r.table_name);
		execute format('drop policy if exists %I on public.%I', r.table_name || '_delete', r.table_name);
		execute format('create policy %I on public.%I for select to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_select', r.table_name, k, 'view');
		execute format('create policy %I on public.%I for insert to authenticated with check (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_insert', r.table_name, k, 'create_delete');
		execute format('create policy %I on public.%I for update to authenticated using (space_id in (select app.accessible_spaces(%L, %L))) with check (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_update', r.table_name, k, 'edit', k, 'edit');
		execute format('create policy %I on public.%I for delete to authenticated using (space_id in (select app.accessible_spaces(%L, %L)))',
			r.table_name || '_delete', r.table_name, k, 'create_delete');
		execute format('grant select, insert, update, delete on public.%I to authenticated', r.table_name);
		execute format('grant select, insert, update, delete on public.%I to service_role', r.table_name);
		execute format('alter table public.%I alter column space_id set default app.personal_space()', r.table_name);
		execute format('alter table public.%I alter column created_by set default auth.uid()', r.table_name);
	end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 5. the day-log stats view sees live persons only (C1, C4)
-- ---------------------------------------------------------------------
create or replace view public.people_daylog_stats
	with (security_invoker = true)
	as
	select
		sp.person_id,
		count(distinct d.day)::int as days_together,
		min(d.day) as first_seen,
		max(d.day) as last_seen
	from public.daylog_scene_people sp
	join public.daylog_scenes s on s.id = sp.scene_id
	join public.daylog_days d on d.id = s.day_id
	join public.people p on p.id = sp.person_id and p.deleted_at is null and p.tier = 'person'
	group by sp.person_id;

-- ---------------------------------------------------------------------
-- 6. promote on first link (C1): one trigger per FK to people.id, found now
-- ---------------------------------------------------------------------
create or replace function public.people_promote_on_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id uuid;
begin
	v_id := (to_jsonb(new) ->> tg_argv[0])::uuid;
	if v_id is not null then
		update public.people set tier = 'person', promoted_at = now(), updated_at = now()
		where id = v_id and tier = 'contact';
	end if;
	return new;
end
$$;
revoke all on function public.people_promote_on_link() from public;

/** The tables that belong to a person (its own numbers, cards, aliases, the import rows) are not links. */
create or replace function public.people_link_tables()
returns table (table_name text, column_name text)
language sql
stable
set search_path = ''
as $$
	select cl.relname::text, a.attname::text
	from pg_constraint c
	join pg_class cl on cl.oid = c.conrelid
	join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
	where c.contype = 'f'
	  and c.confrelid = 'public.people'::regclass
	  and cl.relname not in ('people', 'people_aliases', 'person_phones', 'person_emails', 'person_vcards', 'people_import_candidates')
	order by 1, 2
$$;

do $$
declare
	r record;
begin
	for r in select * from public.people_link_tables() loop
		execute format('drop trigger if exists %I on public.%I', 'promote_on_link_' || r.column_name, r.table_name);
		execute format('create trigger %I after insert or update of %I on public.%I for each row execute function public.people_promote_on_link(%L)',
			'promote_on_link_' || r.column_name, r.column_name, r.table_name, r.column_name);
		raise notice '0140: promote-on-link trigger on %.%', r.table_name, r.column_name;
	end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 7. merge (C3): walk every FK to people.id at run time, in one transaction
-- ---------------------------------------------------------------------
create or replace function public.people_merge(p_survivor uuid, p_loser uuid, p_fields jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_s        public.people%rowtype;
	v_l        public.people%rowtype;
	v_key      text;
	v_type     text;
	r          record;
	u          record;
	v_pred     text;
	n          bigint;
	v_moved    jsonb := '{}'::jsonb;
	v_allowed  text[] := array['first_name', 'last_name', 'display_name', 'relationship', 'birthday', 'address', 'where_we_met', 'mutual_interests', 'notes'];
begin
	if p_survivor = p_loser then
		raise exception 'survivor and loser are the same person';
	end if;
	select * into v_s from public.people where id = p_survivor and deleted_at is null;
	if not found then raise exception 'survivor not found'; end if;
	select * into v_l from public.people where id = p_loser and deleted_at is null;
	if not found then raise exception 'loser not found'; end if;
	if v_s.space_id <> v_l.space_id then
		raise exception 'people are in different spaces';
	end if;
	if v_s.space_id not in (select app.accessible_spaces('organisation.people', 'edit')) then
		raise exception 'not allowed to edit these people';
	end if;

	-- (a) the per-field choices for the survivor
	for v_key in select jsonb_object_keys(p_fields) loop
		if v_key = any (v_allowed) then
			select data_type into v_type from information_schema.columns
			where table_schema = 'public' and table_name = 'people' and column_name = v_key;
			execute format('update public.people set %I = ($1)::%s, updated_at = now() where id = $2', v_key, v_type)
			using nullif(p_fields ->> v_key, ''), p_survivor;
		end if;
	end loop;

	-- (b) the loser's aliases stop being primary before they move
	update public.people_aliases set is_primary = false where person_id = p_loser;

	-- (c) every FK to people.id: delete the loser's rows that would collide
	--     with the survivor's on a unique key, then re-point the rest
	for r in
		select c.conrelid as oid, cl.relname::text as tbl, a.attname::text as col, a.attnum as attnum
		from pg_constraint c
		join pg_class cl on cl.oid = c.conrelid
		join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
		where c.contype = 'f' and c.confrelid = 'public.people'::regclass and c.conrelid <> 'public.people'::regclass
	loop
		for u in select conkey from pg_constraint where conrelid = r.oid and contype in ('u', 'p') and r.attnum = any (conkey) loop
			select string_agg(format('l.%1$I is not distinct from s.%1$I', att.attname), ' and ')
			into v_pred
			from pg_attribute att
			where att.attrelid = r.oid and att.attnum = any (u.conkey) and att.attnum <> r.attnum;
			execute format(
				'delete from public.%1$I l where l.%2$I = $1 and exists (select 1 from public.%1$I s where s.%2$I = $2%3$s)',
				r.tbl, r.col, case when v_pred is null then '' else ' and ' || v_pred end)
			using p_loser, p_survivor;
		end loop;
		execute format('update public.%I set %I = $1 where %I = $2', r.tbl, r.col, r.col) using p_survivor, p_loser;
		get diagnostics n = row_count;
		if n > 0 then
			v_moved := v_moved || jsonb_build_object(r.tbl || '.' || r.col, n);
		end if;
	end loop;

	-- (d) anyone already merged into the loser now points at the survivor
	update public.people set merged_into_id = p_survivor where merged_into_id = p_loser;

	-- (e) the loser is soft-deleted and remembers where it went
	update public.people
	set deleted_at = now(), merged_into_id = p_survivor, updated_at = now()
	where id = p_loser;

	-- (f) a contact merged into a person is a person; a person merged into a contact stays a person
	if v_l.tier = 'person' and v_s.tier = 'contact' then
		update public.people set tier = 'person', promoted_at = now() where id = p_survivor;
	end if;

	insert into public.audit_events (actor_id, principal, action, section, entity_group, entity_id, space_id, meta)
	values (auth.uid(), 'user', 'people.merge', 'organisation', 'people', p_survivor::text, v_s.space_id,
		jsonb_build_object('loser', p_loser, 'moved', v_moved, 'fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_fields) k)));

	return jsonb_build_object('survivor', p_survivor, 'loser', p_loser, 'moved', v_moved);
end
$$;
revoke all on function public.people_merge(uuid, uuid, jsonb) from public;
grant execute on function public.people_merge(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 8. the bin (C4): hard-delete after N days; the nightly cron calls this
-- ---------------------------------------------------------------------
create or replace function public.people_purge_deleted(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
	n int;
begin
	delete from public.people
	where deleted_at is not null and deleted_at < now() - make_interval(days => greatest(p_days, 1));
	get diagnostics n = row_count;
	return n;
end
$$;
revoke all on function public.people_purge_deleted(int) from public;
grant execute on function public.people_purge_deleted(int) to authenticated, service_role;
