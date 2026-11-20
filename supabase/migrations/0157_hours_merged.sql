-- 0157 — Four-Day Week Tracker: a holding section for new Log entries.
--
-- Phil (2026-11-20): entries he adds should sit in a section at the top of
-- the Log, looking like the day groups below, until he presses MERGE; merge
-- moves dated ones into their days and dateless ones into the Backlog.
--
-- merged_at null = waiting at the top. Held entries are saved like any other
-- row (a refresh or another device still shows them) but every derived
-- figure ignores them until they are merged (lib/hours/calc.ts buildIndex).
-- Imports land merged (the column default): the planner's rows are reviewed
-- in the dry run already. Manual adds set merged_at to null explicitly
-- (POST /api/hours/entries). Existing rows are merged as of their creation.
--
-- Depends on: 0156. Rollback: drop the index and the column.

alter table public.hours_entries
	add column if not exists merged_at timestamptz default now();

update public.hours_entries set merged_at = created_at where merged_at is null;

create index if not exists hours_entries_space_unmerged_idx
	on public.hours_entries (space_id) where merged_at is null and deleted_at is null;

comment on column public.hours_entries.merged_at is
	'0157: null while the entry waits in the Log''s holding section; set by MERGE (POST /api/hours/entries/merge). Imports land merged.';

-- Self-check: no live row may be left unmerged by this migration.
do $$
declare v_bad integer;
begin
	select count(*) into v_bad from public.hours_entries where merged_at is null;
	if v_bad > 0 then
		raise exception '0157: % hours_entries rows still have merged_at null after the backfill', v_bad;
	end if;
end $$;
