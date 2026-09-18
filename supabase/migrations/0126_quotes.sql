-- 0126_quotes.sql
-- Quotes v1 (claude/quotes-spec.md §3). A quote captured by voice or text,
-- attributed to a Person (who said it to Phil) or to Phil (is_own), with an
-- optional original author from background research, a merch flag, and
-- the capture it came from. Adopted into spaces (organisation.quotes) with
-- the 0111 policy + grant loop run here (the 0124 lesson). Near-duplicate
-- detection is done in the app (trigram similarity in JS) so no pg_trgm
-- dependency on the hosted project. Depends on: 0125.

create table if not exists public.quotes (
	id                  uuid primary key default gen_random_uuid(),
	text                text not null,
	raw_text            text,                      -- transcript / message exactly as captured; null when UI-created
	said_by_person_id   uuid references public.people(id) on delete set null,
	is_own              boolean not null default false,
	speaker_confidence  text not null default 'certain' check (speaker_confidence in ('certain', 'uncertain')),
	context             text,
	source              text,
	said_at             timestamptz not null default now(),
	merch               boolean not null default false,
	attributed_to       text,
	research_status     text not null default 'pending'
		check (research_status in ('pending', 'running', 'found', 'none', 'skipped', 'failed', 'wrong')),
	research            jsonb,
	research_ran_at     timestamptz,
	capture_id          uuid references public.raw_captures(id) on delete set null,
	created_at          timestamptz not null default now(),
	updated_at          timestamptz not null default now(),
	constraint quotes_own_has_no_person check (not is_own or said_by_person_id is null)
);
create index if not exists quotes_person_idx on public.quotes (said_by_person_id);

select app.adopt_table('quotes');
alter table public.quotes enable row level security;
create index if not exists quotes_space_created_idx on public.quotes (space_id, created_at desc);
create index if not exists quotes_space_merch_idx on public.quotes (space_id) where merch;
create index if not exists quotes_research_pending_idx on public.quotes (research_status, created_at) where research_status in ('pending', 'failed');

insert into public.entity_groups (table_name, section, entity_group)
values ('quotes', 'organisation', 'quotes')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

-- the 0111 policy + grant loop, for this table only
do $$
declare
	r    record;
	k    text;
begin
	for r in select table_name, section, entity_group from public.entity_groups where table_name = 'quotes' loop
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
		execute format('alter table public.%I alter column space_id set default app.personal_space()', r.table_name);
		execute format('alter table public.%I alter column created_by set default auth.uid()', r.table_name);
	end loop;
end
$$;
