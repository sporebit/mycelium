-- 0144_work_labels.sql
-- Work redesign (MYC-174, claude/spec-work.md §2.4, §8.6) — the generic
-- label field (W13): label_fields (per space) → labels → ticket_labels,
-- seeded with Labels, Location and Tool.
--
--   Location is backfilled from tickets.where_ctx, Tool from tickets.tools,
--   Labels from tickets.tags. `anywhere` and `none` mean "no constraint",
--   so they become the absence of a label, not a label.
--
--   The old columns stay for one release. Work never writes them. The old
--   paths still do (tix --where/--tools, capture suggestions — W16 leaves
--   them untouched), so tickets_mirror_labels applies the DELTA of every
--   such write to ticket_labels: what was added attaches, what was removed
--   detaches, and a label added in Work is never disturbed.
-- Habits are skipped (W14).
-- Depends on: 0143.

create table if not exists public.label_fields (
	id         uuid primary key default gen_random_uuid(),
	name       text not null check (length(btrim(name)) > 0),
	slug       text not null check (slug ~ '^[a-z][a-z0-9_]{0,31}$'),
	is_system  boolean not null default false,
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
select app.register_table('label_fields', 'organisation', 'tickets');
create unique index if not exists label_fields_slug_per_space on public.label_fields (space_id, slug);

create table if not exists public.labels (
	id          uuid primary key default gen_random_uuid(),
	field_id    uuid not null references public.label_fields(id) on delete cascade,
	name        text not null check (length(btrim(name)) > 0),
	slug        text not null,
	colour      text,
	archived_at timestamptz,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);
select app.register_table('labels', 'organisation', 'tickets', 'label_fields', 'field_id');
create unique index if not exists labels_slug_per_field on public.labels (field_id, slug);

create table if not exists public.ticket_labels (
	ticket_id  uuid not null references public.tickets(id) on delete cascade,
	label_id   uuid not null references public.labels(id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (ticket_id, label_id)
);
select app.register_table('ticket_labels', 'organisation', 'tickets', 'tickets', 'ticket_id');
create index if not exists ticket_labels_label_idx on public.ticket_labels (label_id);

-- ---------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------
create or replace function public.work_seed_label_fields(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_owner uuid;
begin
	select owner_user_id into v_owner from public.spaces where id = p_space;
	insert into public.label_fields (space_id, created_by, name, slug, is_system, sort_order)
	select p_space, v_owner, x.name, x.slug, true, x.ord
	from (values
		('Labels',   'labels',   1),
		('Location', 'location', 2),
		('Tool',     'tool',     3)
	) as x(name, slug, ord)
	on conflict (space_id, slug) do nothing;
end
$$;
revoke all on function public.work_seed_label_fields(uuid) from public;

select public.work_seed_label_fields(id) from public.spaces;

create or replace function public.spaces_seed_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.work_seed_types(new.id);
	perform public.work_seed_default_project(new.id);
	perform public.work_seed_label_fields(new.id);
	return new;
end
$$;
revoke all on function public.spaces_seed_work() from public;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.work_label_slug(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
	select lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'))
$$;

/** How a raw old-column value reads as a label name. */
create or replace function public.work_label_display(p_field text, p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
	select case
		when p_field = 'tool' and lower(btrim(p_raw)) = 'pc' then 'PC'
		when p_field in ('tool', 'location') then initcap(btrim(p_raw))
		else btrim(p_raw)
	end
$$;

/** Find or create a label in a space's field; null when the name is empty or the field is missing. */
create or replace function public.work_label(p_space uuid, p_field text, p_name text, p_by uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_field uuid;
	v_slug  text := public.work_label_slug(p_name);
	v_id    uuid;
begin
	if v_slug is null or v_slug = '' then
		return null;
	end if;
	select id into v_field from public.label_fields where space_id = p_space and slug = p_field;
	if v_field is null then
		return null;
	end if;
	select id into v_id from public.labels where field_id = v_field and slug = v_slug;
	if v_id is null then
		insert into public.labels (space_id, created_by, field_id, name, slug)
		values (p_space, p_by, v_field, public.work_label_display(p_field, p_name), v_slug)
		on conflict (field_id, slug) do nothing
		returning id into v_id;
		if v_id is null then
			select id into v_id from public.labels where field_id = v_field and slug = v_slug;
		end if;
	end if;
	return v_id;
end
$$;
revoke all on function public.work_label(uuid, text, text, uuid) from public;

/** The label values an old-column row stands for: (field slug, raw value). */
create or replace function public.work_legacy_labels(
	p_where text, p_place uuid, p_tools text[], p_tags text[]
)
returns table (field text, raw text)
language sql
stable
security definer
set search_path = ''
as $$
	select 'location', case
			when p_where in ('home', 'out') then p_where
			when p_where = 'place' then (select pl.name from public.places pl where pl.id = p_place)
		end
	where p_where in ('home', 'out', 'place')
	union
	select 'tool', x from unnest(coalesce(p_tools, '{}'::text[])) as x
	where lower(btrim(x)) not in ('none', '')
	union
	select 'labels', x from unnest(coalesce(p_tags, '{}'::text[])) as x
	where btrim(x) <> ''
$$;
revoke all on function public.work_legacy_labels(text, uuid, text[], text[]) from public;

-- ---------------------------------------------------------------------
-- Backfill (triggers on tickets are not involved: nothing is updated there)
-- ---------------------------------------------------------------------
do $$
declare
	t        record;
	l        record;
	v_label  uuid;
	v_rows   bigint := 0;
	v_loc    bigint;
	v_tool   bigint;
	v_tag    bigint;
begin
	for t in
		select id, space_id, created_by, where_ctx, place_id, tools, tags
		from public.tickets
		where coalesce(kind, 'task') <> 'habit'
	loop
		for l in
			select field, raw from public.work_legacy_labels(t.where_ctx, t.place_id, t.tools, t.tags)
			where raw is not null
		loop
			v_label := public.work_label(t.space_id, l.field, l.raw, t.created_by);
			if v_label is not null then
				insert into public.ticket_labels (space_id, created_by, ticket_id, label_id)
				values (t.space_id, t.created_by, t.id, v_label)
				on conflict do nothing;
				v_rows := v_rows + 1;
			end if;
		end loop;
	end loop;

	select count(distinct tl.ticket_id) filter (where f.slug = 'location'),
	       count(distinct tl.ticket_id) filter (where f.slug = 'tool'),
	       count(distinct tl.ticket_id) filter (where f.slug = 'labels')
	into v_loc, v_tool, v_tag
	from public.ticket_labels tl
	join public.labels lb on lb.id = tl.label_id
	join public.label_fields f on f.id = lb.field_id;
	raise notice '0144 labels: % ticket labels written; tickets with a Location %, a Tool %, a Label %',
		v_rows, v_loc, v_tool, v_tag;
end
$$;

-- ---------------------------------------------------------------------
-- The mirror: an old-path write to where_ctx / place_id / tools / tags
-- ---------------------------------------------------------------------
create or replace function public.tickets_mirror_labels()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	l       record;
	v_label uuid;
begin
	if coalesce(new.kind, 'task') = 'habit' then
		return null;
	end if;

	if tg_op = 'UPDATE' then
		-- what the old columns no longer say
		for l in
			select field, raw from public.work_legacy_labels(old.where_ctx, old.place_id, old.tools, old.tags)
			where raw is not null
			except
			select field, raw from public.work_legacy_labels(new.where_ctx, new.place_id, new.tools, new.tags)
		loop
			delete from public.ticket_labels tl
			using public.labels lb, public.label_fields f
			where tl.ticket_id = new.id
			  and lb.id = tl.label_id and f.id = lb.field_id
			  and f.space_id = new.space_id and f.slug = l.field
			  and lb.slug = public.work_label_slug(l.raw);
		end loop;
	end if;

	-- what they say now and did not before
	for l in
		select field, raw from public.work_legacy_labels(new.where_ctx, new.place_id, new.tools, new.tags)
		where raw is not null
		except
		select field, raw from public.work_legacy_labels(
			case when tg_op = 'UPDATE' then old.where_ctx end,
			case when tg_op = 'UPDATE' then old.place_id end,
			case when tg_op = 'UPDATE' then old.tools end,
			case when tg_op = 'UPDATE' then old.tags end)
	loop
		v_label := public.work_label(new.space_id, l.field, l.raw, new.created_by);
		if v_label is not null then
			insert into public.ticket_labels (space_id, created_by, ticket_id, label_id)
			values (new.space_id, new.created_by, new.id, v_label)
			on conflict do nothing;
		end if;
	end loop;
	return null;
end
$$;
revoke all on function public.tickets_mirror_labels() from public;

drop trigger if exists tickets_mirror_labels on public.tickets;
create trigger tickets_mirror_labels
	after insert or update of where_ctx, place_id, tools, tags on public.tickets
	for each row execute function public.tickets_mirror_labels();
