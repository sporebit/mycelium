-- Migration: pc_metrics gains a machine identity, and the RLS/grant treatment
-- the rest of the schema already has.
--
-- machine_id makes the ingest contract multi-machine ready. Nothing else is
-- planned to write to it in the near term, but the column has to exist before
-- a second reporter can appear, and backfilling identity onto anonymous rows
-- later is guesswork. Existing rows are the desktop, hence the default.
--
-- Depends on: 0074 (pc_metrics). Follows the RLS/grant pattern in 0092.
-- Rollback:
--   DROP VIEW pc_metrics_machines;
--   DROP POLICY "deny all" ON pc_metrics;
--   ALTER TABLE pc_metrics DISABLE ROW LEVEL SECURITY;
--   DROP INDEX pc_metrics_machine_recorded_idx;
--   ALTER TABLE pc_metrics DROP COLUMN machine_id;

alter table pc_metrics
  add column if not exists machine_id text not null default 'desktop';

-- Every read is "latest N for one machine", which this serves directly. The
-- existing recorded_at-only index stays: the retention sweep in M3 deletes
-- across all machines by age and wants it.
create index if not exists pc_metrics_machine_recorded_idx
  on pc_metrics (machine_id, recorded_at desc);

-- RLS was already enabled on the live table with zero policies, which denies
-- anon/authenticated by default but records no intent. The explicit restrictive
-- policy is what the neighbouring tables carry, and it survives someone later
-- adding a permissive policy without thinking it through.
alter table pc_metrics enable row level security;
drop policy if exists "deny all" on pc_metrics;
create policy "deny all" on pc_metrics as restrictive using (false);

grant all on pc_metrics to service_role;

-- The dashboard needs the set of known machines to decide whether to render a
-- selector at all. PostgREST cannot express DISTINCT, so it gets a view rather
-- than pulling every row back and de-duplicating in JavaScript.
--
-- Scoped to the raw table, so this is "machines seen within the retention
-- window" — a machine retired longer ago than that correctly drops out.
create or replace view pc_metrics_machines
  with (security_invoker = true)
  as select distinct machine_id from pc_metrics;

grant select on pc_metrics_machines to service_role;
