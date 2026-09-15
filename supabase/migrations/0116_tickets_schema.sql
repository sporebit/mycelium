-- 0116_tickets_schema.sql
-- Tickets — Part A (schema + rename). From claude/tickets-spec.md §4.
--
-- Renames tasks -> tickets (and task_comments/task_activity), extends projects,
-- adds the areas / workflow / status / links / completions / dependencies /
-- templates tables, adopts them into spaces (P12), regenerates every
-- organisation policy, seeds a default workflow + statuses per space, and
-- backfills a key and a status onto every existing ticket. New inserts get a
-- key from a BEFORE INSERT trigger.
--
-- Reconciliations against the spec (the live schema differed — checked, not
-- assumed):
--   * spec `key text` (the MYC-142 identifier) -> named `ticket_key` here,
--     because tasks already has a boolean `key` (the "key task" flag) wired
--     into blocker and activity logic. Renaming that boolean was avoidable
--     churn; the identifier gets its own column instead.
--   * spec `parent_id` -> the existing `parent_task_id` (0004) is kept; one
--     column, no duplicate.
--   * projects.status check widens (active,archived,completed) ->
--     (active,paused,done,archived); existing 'completed' rows -> 'done'.
--   * task_comments / task_activity exist (0027) with a task_id column ->
--     renamed to ticket_id.
--   * people_mentions has no task_id (polymorphic source_type/source_id) ->
--     left untouched; source_type 'task' rows keep their value.
--   * habits and ui_prefs tables do not exist -> nothing to fold; now_context
--     deferred to a later part.
--   * Deferred to later parts (documented in docs/tickets-partA-notes.md):
--     the reminders fold, the bulk import (backlog.md / reminders /
--     venture_steps / cutover run-book -> tickets), api_tokens (0118),
--     per-project key sequences, and the depth / assignee / category-coverage
--     guard triggers. Part A keeps keys space-scoped.
--
-- Depends on: 0115 (P12 complete: app.adopt_table, spaces, entity_groups,
-- app.accessible_spaces). Numbered after the live chain tip (0115).

-- ---------------------------------------------------------------------
-- 1. Areas
-- ---------------------------------------------------------------------
create table if not exists public.areas (
	id          uuid        primary key default gen_random_uuid(),
	name        text        not null,
	colour      text,
	sort_order  int         not null default 0,
	archived_at timestamptz,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Projects — extend in place, reconcile the status check
-- ---------------------------------------------------------------------
alter table public.projects
	add column if not exists area_id            uuid references public.areas(id) on delete set null,
	add column if not exists parent_id          uuid references public.projects(id) on delete restrict,
	add column if not exists prefix             text,
	add column if not exists next_seq           int  not null default 1,
	add column if not exists workflow_id        uuid,
	add column if not exists github_repo        text,
	add column if not exists github_issues_sync boolean not null default false,
	add column if not exists sort_order         int  not null default 0;

update public.projects set status = 'done' where status = 'completed';
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
	check (status in ('active', 'paused', 'done', 'archived'));

create unique index if not exists projects_prefix_per_space
	on public.projects (space_id, prefix) where prefix is not null;
alter table public.projects drop constraint if exists projects_prefix_shape;
alter table public.projects add constraint projects_prefix_shape
	check (prefix is null or prefix ~ '^[A-Z][A-Z0-9]{1,4}$');

-- ---------------------------------------------------------------------
-- 3. Workflows and statuses (space columns added by adopt_table below)
-- ---------------------------------------------------------------------
create table if not exists public.ticket_workflows (
	id         uuid        primary key default gen_random_uuid(),
	name       text        not null,
	is_default boolean     not null default false,
	created_at timestamptz not null default now()
);

create table if not exists public.ticket_statuses (
	id          uuid primary key default gen_random_uuid(),
	workflow_id uuid not null references public.ticket_workflows(id) on delete cascade,
	name        text not null,
	category    text not null check (category in
		('inbox', 'backlog', 'next', 'doing', 'waiting', 'verify', 'done', 'cancelled')),
	colour      text,
	sort_order  int  not null default 0,
	unique (workflow_id, name)
);

-- ---------------------------------------------------------------------
-- 4. Tickets — rename tasks and extend
-- ---------------------------------------------------------------------
alter table public.tasks         rename to tickets;
alter table public.task_comments rename to ticket_comments;
alter table public.task_activity rename to ticket_activity;
alter table public.ticket_comments rename column task_id to ticket_id;
alter table public.ticket_activity rename column task_id to ticket_id;

alter table public.tickets
	add column if not exists ticket_key           text,
	add column if not exists seq                  int,
	add column if not exists kind                 text not null default 'task'
		check (kind in ('task', 'habit', 'reminder', 'runbook', 'test', 'guide', 'audit', 'setup')),
	add column if not exists status_id            uuid references public.ticket_statuses(id),
	add column if not exists someday              boolean not null default false,
	add column if not exists assignee_id          uuid references auth.users(id) on delete set null,
	add column if not exists waiting_on_person_id uuid references public.people(id) on delete set null,
	add column if not exists scheduled_on         date,
	add column if not exists deadline_on          date,
	add column if not exists remind_at            timestamptz,
	add column if not exists where_ctx            text not null default 'anywhere'
		check (where_ctx in ('anywhere', 'home', 'out', 'place')),
	add column if not exists place_id             uuid references public.places(id) on delete set null,
	add column if not exists tools                text[] not null default '{none}',
	add column if not exists time_window          text not null default 'anytime'
		check (time_window in ('anytime', 'office_hours', 'evenings', 'weekend', 'custom')),
	add column if not exists time_from            time,
	add column if not exists time_to              time,
	add column if not exists days                 smallint[],
	add column if not exists points               smallint check (points in (1, 2, 3, 5, 8, 13)),
	add column if not exists urgent               boolean not null default false,
	add column if not exists now_score            numeric,
	add column if not exists recurrence_rrule     text,
	add column if not exists recurrence_mode      text check (recurrence_mode in ('spawn', 'series')),
	add column if not exists series_id            uuid references public.tickets(id) on delete set null,
	add column if not exists rundown_md           text,
	add column if not exists rundown_generated_at timestamptz,
	add column if not exists rundown_model        text,
	add column if not exists steps_definition     jsonb,
	add column if not exists steps_state          jsonb not null default '{"steps":{},"answers":{},"toggles":{}}'::jsonb,
	add column if not exists template_id          uuid,
	add column if not exists suggested            jsonb,
	add column if not exists source               text not null default 'ui'
		check (source in ('ui', 'telegram', 'shortcut', 'claude', 'github', 'import', 'recurrence', 'template')),
	add column if not exists sync_to_github       boolean not null default false,
	add column if not exists github_issue_number  int,
	add column if not exists github_issue_url     text,
	add column if not exists github_synced_at     timestamptz,
	add column if not exists verified_by          uuid references auth.users(id),
	add column if not exists verified_at          timestamptz,
	add column if not exists cancelled_at         timestamptz,
	add column if not exists sort_order           int  not null default 0;

-- deadline_on supersedes due_date; keep due_date one release (spec §4.4).
update public.tickets set deadline_on = due_date where deadline_on is null and due_date is not null;

create unique index if not exists tickets_key_per_space on public.tickets (space_id, ticket_key) where ticket_key is not null;
create index if not exists tickets_now_idx     on public.tickets (space_id, status_id, scheduled_on, deadline_on);
create index if not exists tickets_project_idx on public.tickets (project_id, status_id);
create index if not exists tickets_series_idx  on public.tickets (series_id) where series_id is not null;

-- ---------------------------------------------------------------------
-- 5. Evidence, completions, dependencies, templates
-- ---------------------------------------------------------------------
create table if not exists public.ticket_links (
	id        uuid primary key default gen_random_uuid(),
	ticket_id uuid not null references public.tickets(id) on delete cascade,
	kind      text not null check (kind in
		('commit', 'pr', 'deploy', 'smoke', 'url', 'attachment', 'calendar_event', 'email', 'github_issue', 'purchase')),
	ref       text,
	url       text,
	label     text,
	meta      jsonb,
	at        timestamptz not null default now()
);
create index if not exists ticket_links_ticket_idx on public.ticket_links (ticket_id, kind);

create table if not exists public.ticket_completions (
	id           uuid primary key default gen_random_uuid(),
	ticket_id    uuid not null references public.tickets(id) on delete cascade,
	completed_on date not null,
	completed_by uuid references auth.users(id),
	at           timestamptz not null default now(),
	unique (ticket_id, completed_on)
);

create table if not exists public.ticket_dependencies (
	blocker_id uuid not null references public.tickets(id) on delete cascade,
	blocked_id uuid not null references public.tickets(id) on delete cascade,
	primary key (blocker_id, blocked_id),
	check (blocker_id <> blocked_id)
);

create table if not exists public.ticket_templates (
	id         uuid primary key default gen_random_uuid(),
	slug       text not null,
	name       text not null,
	kind       text not null default 'task',
	definition jsonb not null,
	shared     boolean not null default false,
	origin     text not null default 'ui' check (origin in ('ui', 'repo')),
	version    int  not null default 1,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Adopt every new table (space_id, created_by, FKs) — P12 pattern.
--    Children take their space from the parent; the rest fall to the owner.
-- ---------------------------------------------------------------------
select app.adopt_table('areas');
select app.adopt_table('ticket_workflows');
select app.adopt_table('ticket_statuses',     'ticket_workflows', 'workflow_id');
select app.adopt_table('ticket_links',        'tickets',          'ticket_id');
select app.adopt_table('ticket_completions',  'tickets',          'ticket_id');
select app.adopt_table('ticket_dependencies', 'tickets',          'blocker_id');
select app.adopt_table('ticket_templates');

-- adopt_table does not touch RLS; enable it so the generated policies bite.
alter table public.areas               enable row level security;
alter table public.ticket_workflows    enable row level security;
alter table public.ticket_statuses     enable row level security;
alter table public.ticket_links        enable row level security;
alter table public.ticket_completions  enable row level security;
alter table public.ticket_dependencies enable row level security;
alter table public.ticket_templates    enable row level security;

-- space-scoped uniqueness now that space_id exists
create unique index if not exists ticket_workflows_one_default
	on public.ticket_workflows (space_id) where is_default;

-- ---------------------------------------------------------------------
-- 7. Registry rows: replace organisation.tasks with organisation.tickets
-- ---------------------------------------------------------------------
delete from public.entity_groups where table_name in ('tasks', 'task_comments', 'task_activity');
insert into public.entity_groups (table_name, section, entity_group) values
	('tickets',              'organisation', 'tickets'),
	('ticket_comments',      'organisation', 'tickets'),
	('ticket_activity',      'organisation', 'tickets'),
	('areas',                'organisation', 'tickets'),
	('ticket_workflows',     'organisation', 'tickets'),
	('ticket_statuses',      'organisation', 'tickets'),
	('ticket_links',         'organisation', 'tickets'),
	('ticket_completions',   'organisation', 'tickets'),
	('ticket_dependencies',  'organisation', 'tickets'),
	('ticket_templates',     'organisation', 'tickets')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;
update public.entity_groups set entity_group = 'tickets' where table_name = 'projects';

-- ---------------------------------------------------------------------
-- 8. Policies, grants, defaults for every registered table (0111 pattern,
--    re-run so the renamed and new tables are covered; idempotent).
-- ---------------------------------------------------------------------
do $$
declare
	r          record;
	k          text;
	owner_only boolean;
	rule       text;
begin
	for r in select table_name, section, entity_group from public.entity_groups order by table_name loop
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
	end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 9. Space prefix for keys (spec §17.1)
-- ---------------------------------------------------------------------
alter table public.spaces
	add column if not exists ticket_prefix text,
	add column if not exists next_seq      int not null default 1;
update public.spaces set ticket_prefix = 'MYC' where ticket_prefix is null;

-- ---------------------------------------------------------------------
-- 10. Seed a default workflow + the eight statuses per space
-- ---------------------------------------------------------------------
do $$
declare
	s      record;
	v_wf   uuid;
	v_owner uuid;
begin
	for s in select id, owner_user_id from public.spaces loop
		v_owner := s.owner_user_id;  -- null for team spaces; created_by is nullable
		select id into v_wf from public.ticket_workflows where space_id = s.id and is_default limit 1;
		if v_wf is null then
			insert into public.ticket_workflows (space_id, created_by, name, is_default)
			values (s.id, v_owner, 'Default', true)
			returning id into v_wf;
		end if;
		insert into public.ticket_statuses (space_id, created_by, workflow_id, name, category, sort_order)
		select s.id, v_owner, v_wf, x.name, x.category, x.ord
		from (values
			('Inbox', 'inbox', 0), ('Backlog', 'backlog', 1), ('Next', 'next', 2),
			('Doing', 'doing', 3), ('Waiting', 'waiting', 4), ('Verify', 'verify', 5),
			('Done', 'done', 6), ('Cancelled', 'cancelled', 7)
		) as x(name, category, ord)
		on conflict (workflow_id, name) do nothing;
	end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 11. Backfill status_id and a space-scoped key onto existing tickets
-- ---------------------------------------------------------------------
do $$
declare
	t        record;
	v_status uuid;
	v_prefix text;
	v_seq    int;
begin
	for t in select id, space_id, completed_at from public.tickets order by created_at, id loop
		select st.id into v_status
		from public.ticket_statuses st
		join public.ticket_workflows wf on wf.id = st.workflow_id and wf.is_default
		where st.space_id = t.space_id
		  and st.category = case when t.completed_at is not null then 'done' else 'backlog' end
		limit 1;
		update public.tickets set status_id = v_status where id = t.id and status_id is null;

		if (select ticket_key from public.tickets where id = t.id) is null then
			select ticket_prefix, next_seq into v_prefix, v_seq from public.spaces where id = t.space_id for update;
			update public.tickets set ticket_key = v_prefix || '-' || v_seq, seq = v_seq where id = t.id;
			update public.spaces set next_seq = v_seq + 1 where id = t.space_id;
		end if;
	end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 12. Key-generation trigger for new tickets (space-scoped in Part A)
-- ---------------------------------------------------------------------
create or replace function public.tickets_assign_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_prefix text;
	v_seq    int;
begin
	if new.ticket_key is not null then
		return new;
	end if;
	select ticket_prefix, next_seq into v_prefix, v_seq
	from public.spaces where id = new.space_id for update;
	if v_prefix is null then
		v_prefix := 'TKT';
	end if;
	update public.spaces set next_seq = v_seq + 1 where id = new.space_id;
	new.seq := v_seq;
	new.ticket_key := v_prefix || '-' || v_seq;
	return new;
end
$$;
revoke all on function public.tickets_assign_key() from public;

drop trigger if exists tickets_assign_key on public.tickets;
create trigger tickets_assign_key
	before insert on public.tickets
	for each row execute function public.tickets_assign_key();
