-- 0146_docs.sql
-- Docs (MYC-174, claude/spec-work.md §2.6, §7; W9) — a Confluence-style
-- page tree per doc space, versions, page ↔ ticket links, per-page
-- restriction, page templates.
--
--   • doc_spaces             a tree of pages; a P12 space can hold several
--   • doc_pages              Tiptap JSON body + a plain-text rendition
--   • doc_page_versions      written by trigger on every change of title or
--                            body, so no caller can skip a version
--   • doc_page_links         page ↔ ticket, one row for both directions
--   • doc_page_restrictions  who may see / edit a restricted page
--   • doc_templates          UI-made and repo JSON
-- Permissions: the P12 roles on entity group organisation.docs, narrowed
-- per page. A restricted page hides itself AND its descendants from
-- everyone but its creator and the listed users. The visibility check is a
-- security definer function so the policies do not recurse into each
-- other (the 0130 lesson).
-- Depends on: 0145.

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.doc_spaces (
	id           uuid primary key default gen_random_uuid(),
	key          text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
	name         text not null check (length(btrim(name)) > 0),
	description  text,
	icon         text,
	home_page_id uuid,
	archived_at  timestamptz,
	created_at   timestamptz not null default now(),
	updated_at   timestamptz not null default now()
);
select app.register_table('doc_spaces', 'organisation', 'docs');
create unique index if not exists doc_spaces_key_per_space on public.doc_spaces (space_id, key);

create table if not exists public.doc_pages (
	id           uuid primary key default gen_random_uuid(),
	doc_space_id uuid not null references public.doc_spaces(id) on delete cascade,
	parent_id    uuid references public.doc_pages(id) on delete set null,
	title        text not null default 'Untitled',
	body         jsonb not null default '{"type":"doc","content":[]}'::jsonb,
	body_text    text not null default '',
	position     int not null default 0,
	version      int not null default 1,
	restricted   boolean not null default false,
	archived_at  timestamptz,
	updated_by   uuid references auth.users(id) on delete set null,
	created_at   timestamptz not null default now(),
	updated_at   timestamptz not null default now(),
	check (parent_id is null or parent_id <> id)
);
select app.register_table('doc_pages', 'organisation', 'docs', 'doc_spaces', 'doc_space_id');
create index if not exists doc_pages_tree_idx on public.doc_pages (doc_space_id, parent_id, position);
create index if not exists doc_pages_title_idx on public.doc_pages (space_id, lower(title));

alter table public.doc_spaces
	drop constraint if exists doc_spaces_home_page_fkey,
	add constraint doc_spaces_home_page_fkey foreign key (home_page_id) references public.doc_pages(id) on delete set null;

create table if not exists public.doc_page_versions (
	id         uuid primary key default gen_random_uuid(),
	page_id    uuid not null references public.doc_pages(id) on delete cascade,
	version    int not null,
	title      text not null,
	body       jsonb not null,
	body_text  text not null default '',
	note       text,
	created_at timestamptz not null default now(),
	unique (page_id, version)
);
select app.register_table('doc_page_versions', 'organisation', 'docs', 'doc_pages', 'page_id');

create table if not exists public.doc_page_links (
	page_id    uuid not null references public.doc_pages(id) on delete cascade,
	ticket_id  uuid not null references public.tickets(id) on delete cascade,
	source     text not null default 'manual' check (source in ('manual', 'mention')),
	created_at timestamptz not null default now(),
	primary key (page_id, ticket_id)
);
select app.register_table('doc_page_links', 'organisation', 'docs', 'doc_pages', 'page_id');
create index if not exists doc_page_links_ticket_idx on public.doc_page_links (ticket_id);

create table if not exists public.doc_page_restrictions (
	page_id    uuid not null references public.doc_pages(id) on delete cascade,
	grantee_id uuid not null references auth.users(id) on delete cascade,
	can_edit   boolean not null default false,
	created_at timestamptz not null default now(),
	primary key (page_id, grantee_id)
);
select app.register_table('doc_page_restrictions', 'organisation', 'docs', 'doc_pages', 'page_id');

create table if not exists public.doc_templates (
	id          uuid primary key default gen_random_uuid(),
	slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
	name        text not null check (length(btrim(name)) > 0),
	description text,
	title       text,
	body        jsonb not null,
	origin      text not null default 'ui' check (origin in ('ui', 'repo')),
	version     int not null default 1,
	shared      boolean not null default true,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);
select app.register_table('doc_templates', 'organisation', 'docs');
create unique index if not exists doc_templates_slug_per_space on public.doc_templates (space_id, slug);

alter table public.notifications
	drop constraint if exists notifications_doc_page_fkey,
	add constraint notifications_doc_page_fkey foreign key (doc_page_id) references public.doc_pages(id) on delete cascade;

-- ---------------------------------------------------------------------
-- 2. Per-page restriction
-- ---------------------------------------------------------------------
/** The nearest restricted page at or above p_page; null when none is. */
create or replace function app.doc_page_restricting(p_page uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	with recursive up as (
		select id, parent_id, restricted, 1 as depth
		from public.doc_pages where id = p_page
		union all
		select p.id, p.parent_id, p.restricted, up.depth + 1
		from public.doc_pages p
		join up on p.id = up.parent_id
		where up.depth < 64
	)
	select id from up where restricted order by depth limit 1
$$;
revoke all on function app.doc_page_restricting(uuid) from public;
grant execute on function app.doc_page_restricting(uuid) to authenticated, service_role;

create or replace function app.doc_page_visible(p_page uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select not exists (
		with recursive up as (
			select id, parent_id, restricted, created_by, 1 as depth
			from public.doc_pages where id = p_page
			union all
			select p.id, p.parent_id, p.restricted, p.created_by, up.depth + 1
			from public.doc_pages p
			join up on p.id = up.parent_id
			where up.depth < 64
		)
		select 1 from up
		where up.restricted
		  and up.created_by is distinct from auth.uid()
		  and not exists (
			select 1 from public.doc_page_restrictions r
			where r.page_id = up.id and r.grantee_id = auth.uid()
		  )
	)
$$;
revoke all on function app.doc_page_visible(uuid) from public;
grant execute on function app.doc_page_visible(uuid) to authenticated, service_role;

create or replace function app.doc_page_editable(p_page uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select not exists (
		with recursive up as (
			select id, parent_id, restricted, created_by, 1 as depth
			from public.doc_pages where id = p_page
			union all
			select p.id, p.parent_id, p.restricted, p.created_by, up.depth + 1
			from public.doc_pages p
			join up on p.id = up.parent_id
			where up.depth < 64
		)
		select 1 from up
		where up.restricted
		  and up.created_by is distinct from auth.uid()
		  and not exists (
			select 1 from public.doc_page_restrictions r
			where r.page_id = up.id and r.grantee_id = auth.uid() and r.can_edit
		  )
	)
$$;
revoke all on function app.doc_page_editable(uuid) from public;
grant execute on function app.doc_page_editable(uuid) to authenticated, service_role;

/** Only a page's creator sets its restriction list. */
create or replace function app.doc_page_owned(p_page uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (select 1 from public.doc_pages where id = p_page and created_by = auth.uid())
$$;
revoke all on function app.doc_page_owned(uuid) from public;
grant execute on function app.doc_page_owned(uuid) to authenticated, service_role;

-- pages: a new page may go under a parent the writer can edit
drop policy if exists doc_pages_restricted_select on public.doc_pages;
create policy doc_pages_restricted_select on public.doc_pages
	as restrictive for select to authenticated
	using (app.doc_page_visible(id));
drop policy if exists doc_pages_restricted_insert on public.doc_pages;
create policy doc_pages_restricted_insert on public.doc_pages
	as restrictive for insert to authenticated
	with check (parent_id is null or app.doc_page_editable(parent_id));
drop policy if exists doc_pages_restricted_update on public.doc_pages;
create policy doc_pages_restricted_update on public.doc_pages
	as restrictive for update to authenticated
	using (app.doc_page_editable(id))
	with check (parent_id is null or app.doc_page_editable(parent_id));
drop policy if exists doc_pages_restricted_delete on public.doc_pages;
create policy doc_pages_restricted_delete on public.doc_pages
	as restrictive for delete to authenticated
	using (app.doc_page_editable(id));

-- versions and links follow their page
drop policy if exists doc_page_versions_restricted on public.doc_page_versions;
create policy doc_page_versions_restricted on public.doc_page_versions
	as restrictive for select to authenticated
	using (app.doc_page_visible(page_id));
drop policy if exists doc_page_links_restricted_select on public.doc_page_links;
create policy doc_page_links_restricted_select on public.doc_page_links
	as restrictive for select to authenticated
	using (app.doc_page_visible(page_id));
drop policy if exists doc_page_links_restricted_write on public.doc_page_links;
create policy doc_page_links_restricted_write on public.doc_page_links
	as restrictive for insert to authenticated
	with check (app.doc_page_editable(page_id));
drop policy if exists doc_page_links_restricted_delete on public.doc_page_links;
create policy doc_page_links_restricted_delete on public.doc_page_links
	as restrictive for delete to authenticated
	using (app.doc_page_editable(page_id));

-- the restriction list: visible to those who can see the page, written by
-- its creator. The names must not be <table>_select … _delete: those are
-- the loop's permissive policies, and reusing a name would replace them.
drop policy if exists doc_page_restrictions_owner_select on public.doc_page_restrictions;
create policy doc_page_restrictions_owner_select on public.doc_page_restrictions
	as restrictive for select to authenticated
	using (app.doc_page_visible(page_id));
drop policy if exists doc_page_restrictions_owner_insert on public.doc_page_restrictions;
create policy doc_page_restrictions_owner_insert on public.doc_page_restrictions
	as restrictive for insert to authenticated
	with check (app.doc_page_owned(page_id));
drop policy if exists doc_page_restrictions_owner_update on public.doc_page_restrictions;
create policy doc_page_restrictions_owner_update on public.doc_page_restrictions
	as restrictive for update to authenticated
	using (app.doc_page_owned(page_id))
	with check (app.doc_page_owned(page_id));
drop policy if exists doc_page_restrictions_owner_delete on public.doc_page_restrictions;
create policy doc_page_restrictions_owner_delete on public.doc_page_restrictions
	as restrictive for delete to authenticated
	using (app.doc_page_owned(page_id));

-- ---------------------------------------------------------------------
-- 3. Tree integrity and versions
-- ---------------------------------------------------------------------
create or replace function public.doc_pages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_space uuid;
	v_cur   uuid;
	v_depth int := 0;
begin
	if new.parent_id is not null
	   and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id
	        or new.doc_space_id is distinct from old.doc_space_id) then
		select doc_space_id into v_space from public.doc_pages where id = new.parent_id;
		if v_space is distinct from new.doc_space_id then
			raise exception 'a page and its parent must be in the same doc space';
		end if;
		-- no cycles: walk up from the parent; meeting this page means a loop
		v_cur := new.parent_id;
		while v_cur is not null and v_depth < 64 loop
			if v_cur = new.id then
				raise exception 'a page cannot be moved under itself';
			end if;
			select parent_id into v_cur from public.doc_pages where id = v_cur;
			v_depth := v_depth + 1;
		end loop;
	end if;

	if tg_op = 'UPDATE' then
		if new.title is distinct from old.title or new.body is distinct from old.body then
			new.version := old.version + 1;
			new.updated_at := now();
			new.updated_by := coalesce(auth.uid(), new.updated_by);
		else
			new.version := old.version;
		end if;
	else
		new.version := 1;
		new.updated_by := coalesce(new.updated_by, auth.uid(), new.created_by);
	end if;
	return new;
end
$$;
revoke all on function public.doc_pages_guard() from public;

drop trigger if exists doc_pages_guard on public.doc_pages;
create trigger doc_pages_guard
	before insert or update on public.doc_pages
	for each row execute function public.doc_pages_guard();

create or replace function public.doc_pages_write_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' or new.version is distinct from old.version then
		insert into public.doc_page_versions (space_id, created_by, page_id, version, title, body, body_text)
		values (new.space_id, coalesce(new.updated_by, new.created_by), new.id, new.version, new.title, new.body, new.body_text)
		on conflict (page_id, version) do nothing;
	end if;
	return null;
end
$$;
revoke all on function public.doc_pages_write_version() from public;

drop trigger if exists doc_pages_write_version on public.doc_pages;
create trigger doc_pages_write_version
	after insert or update on public.doc_pages
	for each row execute function public.doc_pages_write_version();

-- ---------------------------------------------------------------------
-- 4. Seed: one doc space per space, with a home page
-- ---------------------------------------------------------------------
create or replace function public.work_seed_docs(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_owner uuid;
	v_ds    uuid;
	v_page  uuid;
begin
	if exists (select 1 from public.doc_spaces where space_id = p_space) then
		return;
	end if;
	select owner_user_id into v_owner from public.spaces where id = p_space;
	insert into public.doc_spaces (space_id, created_by, key, name, description)
	values (p_space, v_owner, 'HOME', 'Home', 'Notes, how-tos and decisions.')
	returning id into v_ds;
	insert into public.doc_pages (space_id, created_by, doc_space_id, title, body, body_text)
	values (p_space, v_owner, v_ds, 'Home',
		'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Pages live in a tree. Add one from the sidebar, or link a page to a ticket with its key."}]}]}'::jsonb,
		'Pages live in a tree. Add one from the sidebar, or link a page to a ticket with its key.')
	returning id into v_page;
	update public.doc_spaces set home_page_id = v_page where id = v_ds;
end
$$;
revoke all on function public.work_seed_docs(uuid) from public;

select public.work_seed_docs(id) from public.spaces;

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
	perform public.work_seed_filters(new.id);
	perform public.work_seed_docs(new.id);
	return new;
end
$$;
revoke all on function public.spaces_seed_work() from public;

-- ---------------------------------------------------------------------
-- 5. Self-check for 0141–0146: every new table is under RLS, carries the
--    four space policies, is registered, and is granted to both roles.
--    (A rehearsal caught a restrictive policy replacing a permissive one
--    of the same name; this makes that a failed migration, not a 500.)
-- ---------------------------------------------------------------------
do $$
declare
	t        text;
	v_tables text[] := array[
		'issue_types', 'project_issue_types', 'ticket_workflow_map', 'components', 'ticket_components',
		'label_fields', 'labels', 'ticket_labels', 'ticket_watchers', 'saved_filters', 'notifications',
		'doc_spaces', 'doc_pages', 'doc_page_versions', 'doc_page_links', 'doc_page_restrictions', 'doc_templates'
	];
	n        int;
begin
	foreach t in array v_tables loop
		if not (select c.relrowsecurity from pg_catalog.pg_class c
		        where c.oid = ('public.' || quote_ident(t))::regclass) then
			raise exception 'work self-check: RLS is off on %', t;
		end if;
		select count(*) into n from pg_catalog.pg_policies
		where schemaname = 'public' and tablename = t and permissive = 'PERMISSIVE'
		  and policyname in (t || '_select', t || '_insert', t || '_update', t || '_delete');
		if n <> 4 then
			raise exception 'work self-check: % has % of its 4 space policies', t, n;
		end if;
		if exists (select 1 from pg_catalog.pg_policies
		           where schemaname = 'public' and tablename = t and policyname = 'deny all') then
			raise exception 'work self-check: % still carries deny all', t;
		end if;
		if not exists (select 1 from public.entity_groups where table_name = t) then
			raise exception 'work self-check: % is not in entity_groups', t;
		end if;
		if not pg_catalog.has_table_privilege('authenticated', 'public.' || quote_ident(t), 'select')
		   or not pg_catalog.has_table_privilege('service_role', 'public.' || quote_ident(t), 'select') then
			raise exception 'work self-check: % is missing a grant', t;
		end if;
	end loop;
	if exists (select 1 from pg_catalog.pg_trigger
	           where tgrelid = 'public.tickets'::regclass and not tgisinternal and tgenabled = 'D') then
		raise exception 'work self-check: a trigger on tickets is still disabled';
	end if;
	raise notice '0146 self-check: % tables under RLS with their space policies and grants', array_length(v_tables, 1);
end
$$;
