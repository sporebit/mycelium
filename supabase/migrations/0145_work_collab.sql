-- 0145_work_collab.sql
-- Work redesign (MYC-174, claude/spec-work.md §2.5) — watchers, saved
-- filters, notifications, rich text (W7, W8, W12).
--
--   • ticket_watchers   who follows a ticket
--   • saved_filters     JQL + its compiled query object; shared per space
--                       unless the creator keeps one private
--   • notifications     one row per recipient per event; the space
--                       policies from the loop PLUS a restrictive policy
--                       so only the recipient can read or change a row
--   • user_settings.notification_prefs   per-user channel settings
--   • tickets.description_doc, ticket_comments.body_doc   Tiptap JSON
--     beside the plain text, which stays the searchable, exportable copy
-- push_subscriptions (0039) already exists and is reused.
-- Columns that name a person are never called user_id: app.adopt_table
-- reads that name as the pre-P12 ownership column and drops it.
-- Depends on: 0144.

-- ---------------------------------------------------------------------
-- 1. Watchers
-- ---------------------------------------------------------------------
create table if not exists public.ticket_watchers (
	ticket_id  uuid not null references public.tickets(id) on delete cascade,
	watcher_id uuid not null references auth.users(id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (ticket_id, watcher_id)
);
select app.register_table('ticket_watchers', 'organisation', 'tickets', 'tickets', 'ticket_id');
create index if not exists ticket_watchers_watcher_idx on public.ticket_watchers (watcher_id);

-- ---------------------------------------------------------------------
-- 2. Saved filters
-- ---------------------------------------------------------------------
create table if not exists public.saved_filters (
	id          uuid primary key default gen_random_uuid(),
	name        text not null check (length(btrim(name)) > 0),
	slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
	description text,
	jql         text not null,
	query       jsonb not null,
	shared      boolean not null default true,
	is_system   boolean not null default false,
	sort_order  int not null default 0,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);
select app.register_table('saved_filters', 'organisation', 'tickets');
create unique index if not exists saved_filters_slug_per_space on public.saved_filters (space_id, slug);

-- a private filter is its creator's alone
drop policy if exists saved_filters_private on public.saved_filters;
create policy saved_filters_private on public.saved_filters
	as restrictive for all to authenticated
	using (shared or created_by = auth.uid())
	with check (shared or created_by = auth.uid());

create or replace function public.work_seed_filters(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_owner uuid;
begin
	select owner_user_id into v_owner from public.spaces where id = p_space;
	insert into public.saved_filters (space_id, created_by, name, slug, description, jql, query, shared, is_system, sort_order)
	select p_space, v_owner, x.name, x.slug, x.description, x.jql, x.query::jsonb, true, true, x.ord
	from (values
		('Now', 'now', 'What can be done here, with what is to hand. Edit the location and tool to suit.',
			'location = home AND tool = pc AND statusCategory != Done ORDER BY due ASC',
			'{"where":{"op":"and","nodes":[{"field":"location","cmp":"=","value":"home"},{"field":"tool","cmp":"=","value":"pc"},{"field":"statusCategory","cmp":"!=","value":"done"}]},"orderBy":[{"field":"due","dir":"asc"}]}',
			1),
		('My open work', 'my-open-work', 'Assigned to me and not done.',
			'assignee = me AND statusCategory != Done ORDER BY due ASC',
			'{"where":{"op":"and","nodes":[{"field":"assignee","cmp":"=","value":"me"},{"field":"statusCategory","cmp":"!=","value":"done"}]},"orderBy":[{"field":"due","dir":"asc"}]}',
			2),
		('Inbox', 'inbox', 'Captured and not yet sorted.',
			'status = Inbox ORDER BY created ASC',
			'{"where":{"field":"status","cmp":"=","value":"Inbox"},"orderBy":[{"field":"created","dir":"asc"}]}',
			3),
		('Due this week', 'due-this-week', 'Open, with a due date in the next seven days or already past.',
			'due <= +7d AND statusCategory != Done ORDER BY due ASC',
			'{"where":{"op":"and","nodes":[{"field":"due","cmp":"<=","value":"+7d"},{"field":"statusCategory","cmp":"!=","value":"done"}]},"orderBy":[{"field":"due","dir":"asc"}]}',
			4),
		('Recently resolved', 'recently-resolved', 'Resolved in the last fourteen days.',
			'resolved >= -14d ORDER BY resolved DESC',
			'{"where":{"field":"resolved","cmp":">=","value":"-14d"},"orderBy":[{"field":"resolved","dir":"desc"}]}',
			5)
	) as x(name, slug, description, jql, query, ord)
	on conflict (space_id, slug) do nothing;
end
$$;
revoke all on function public.work_seed_filters(uuid) from public;

select public.work_seed_filters(id) from public.spaces;

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
	return new;
end
$$;
revoke all on function public.spaces_seed_work() from public;

-- ---------------------------------------------------------------------
-- 3. Notifications
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
	id          uuid primary key default gen_random_uuid(),
	recipient_id uuid not null references auth.users(id) on delete cascade,
	actor_id    uuid references auth.users(id) on delete set null,
	event       text not null check (event in ('mention', 'assignment', 'status_change', 'comment')),
	ticket_id   uuid references public.tickets(id) on delete cascade,
	doc_page_id uuid,
	comment_id  uuid references public.ticket_comments(id) on delete set null,
	title       text not null,
	body        text,
	url         text,
	read_at     timestamptz,
	delivered   jsonb not null default '{}'::jsonb,
	created_at  timestamptz not null default now()
);
select app.register_table('notifications', 'organisation', 'tickets');
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

-- The actor writes the row (insert stays on the space policy); only the
-- recipient reads it, marks it read or deletes it.
drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications
	as restrictive for select to authenticated
	using (recipient_id = auth.uid());
drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications
	as restrictive for update to authenticated
	using (recipient_id = auth.uid())
	with check (recipient_id = auth.uid());
drop policy if exists notifications_recipient_delete on public.notifications;
create policy notifications_recipient_delete on public.notifications
	as restrictive for delete to authenticated
	using (recipient_id = auth.uid());

alter table public.user_settings
	add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 4. Rich text beside the plain text
-- ---------------------------------------------------------------------
alter table public.tickets
	add column if not exists description_doc jsonb;
alter table public.ticket_comments
	add column if not exists body_doc jsonb;

-- An old path that rewrites the text alone leaves no stale document behind.
create or replace function public.tickets_clear_stale_doc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.description is distinct from old.description
	   and new.description_doc is not distinct from old.description_doc then
		new.description_doc := null;
	end if;
	return new;
end
$$;

drop trigger if exists tickets_03_clear_stale_doc on public.tickets;
create trigger tickets_03_clear_stale_doc
	before update of description on public.tickets
	for each row execute function public.tickets_clear_stale_doc();

create or replace function public.ticket_comments_clear_stale_doc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.body is distinct from old.body
	   and new.body_doc is not distinct from old.body_doc then
		new.body_doc := null;
	end if;
	return new;
end
$$;

drop trigger if exists ticket_comments_clear_stale_doc on public.ticket_comments;
create trigger ticket_comments_clear_stale_doc
	before update of body on public.ticket_comments
	for each row execute function public.ticket_comments_clear_stale_doc();
