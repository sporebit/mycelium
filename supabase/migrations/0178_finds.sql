-- 0178 — the Finds feed (master run §12; backlog "Finds feed", decided by
-- Phil 2026-11-20).
--
-- A find is a post, repo, skill, tool, article or advisory worth a look:
-- shared in from the X app through capture, or found by a watcher (GitHub,
-- Hacker News, RSS, the advisory database). Each is kept once by its URL,
-- opened, summarised and given a verdict by the model; the person answers
-- Keep or Skip in the weekly review. Nothing is installed automatically.
--
--   finds          one row per URL per person, with its verdict and answer
--   find_sources   the watchers the person has on, and when each last ran
--
-- Both are personal: a person's reading list is their own. The 0111
-- shape (space_id = the reader's personal space), section studio, group
-- finds in the access registry.
--
-- Depends on: 0103 (app.adopt_table, app.personal_space), 0111.

create table if not exists public.finds (
	id            uuid        primary key default gen_random_uuid(),
	url           text        not null check (length(url) between 8 and 2000),
	title         text        not null check (length(title) between 1 and 300),
	-- share | github | hn | rss | advisory | audit | manual
	source        text        not null check (source in ('share', 'github', 'hn', 'rss', 'advisory', 'audit', 'manual')),
	-- the feed, query or repo the watcher was reading; the capture for a share
	source_ref    text,
	-- repo | post | skill | tool | article | advisory | other
	kind          text        not null default 'other' check (kind in ('repo', 'post', 'skill', 'tool', 'article', 'advisory', 'other')),
	found_at      timestamptz not null default now(),
	-- what the watcher saw (stars, score, snippet) and the opened page's text, for the verdict
	raw           jsonb       not null default '{}'::jsonb,
	-- { what, cost, licence, cautions, verdict: use_now | maybe_later | skip, suits: [], summary }
	verdict       jsonb,
	verdict_by    text        check (verdict_by in ('pc', 'cloud')),
	verdicted_at  timestamptz,
	-- the person's own word in the weekly review
	answer        text        check (answer in ('keep', 'skip')),
	answered_at   timestamptz,
	capture_id    uuid        references public.raw_captures (id) on delete set null
);

create table if not exists public.find_sources (
	id            uuid        primary key default gen_random_uuid(),
	-- github | hn | rss | advisory | audit | imap
	kind          text        not null check (kind in ('github', 'hn', 'rss', 'advisory', 'audit', 'imap')),
	label         text        not null check (length(label) between 1 and 120),
	-- a feed URL, a search query, or null for a watcher that needs none
	target        text,
	enabled       boolean     not null default true,
	last_run_at   timestamptz,
	last_result   jsonb,
	created_at    timestamptz not null default now()
);

do $$
declare
	t text;
begin
	foreach t in array array['finds', 'find_sources']
	loop
		perform app.adopt_table(t);
		execute format('alter table public.%I enable row level security', t);
		execute format('grant all on public.%I to service_role', t);
		insert into public.entity_groups (table_name, section, entity_group)
		values (t, 'studio', 'finds')
		on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;
		execute format('drop policy if exists "deny all" on public.%I', t);
		execute format('drop policy if exists %I on public.%I', t || '_select', t);
		execute format('drop policy if exists %I on public.%I', t || '_insert', t);
		execute format('drop policy if exists %I on public.%I', t || '_update', t);
		execute format('drop policy if exists %I on public.%I', t || '_delete', t);
		execute format('create policy %I on public.%I for select to authenticated using (space_id = app.personal_space())', t || '_select', t);
		execute format('create policy %I on public.%I for insert to authenticated with check (space_id = app.personal_space())', t || '_insert', t);
		execute format('create policy %I on public.%I for update to authenticated using (space_id = app.personal_space()) with check (space_id = app.personal_space())', t || '_update', t);
		execute format('create policy %I on public.%I for delete to authenticated using (space_id = app.personal_space())', t || '_delete', t);
		execute format('grant select, insert, update, delete on public.%I to authenticated', t);
		execute format('alter table public.%I alter column space_id set default app.personal_space()', t);
		execute format('alter table public.%I alter column created_by set default auth.uid()', t);
	end loop;
end
$$;

-- one row per URL per person: the second sighting of a link is not a second find
create unique index if not exists finds_once on public.finds (space_id, url);
create index if not exists finds_week_idx on public.finds (space_id, found_at desc);
create index if not exists finds_unverdicted_idx on public.finds (space_id, found_at) where verdict is null;
create unique index if not exists find_sources_once on public.find_sources (space_id, kind, coalesce(target, ''));
