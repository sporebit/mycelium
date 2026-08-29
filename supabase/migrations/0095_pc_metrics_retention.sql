-- Migration: retention and history for pc_metrics.
--
-- Raw rows were being pruned by a DELETE issued inside every POST — 1,440
-- delete statements a day to do one day's work, on the latency path of the
-- ingest, and silently skipped entirely whenever the agent was offline (the
-- one time a backlog actually accumulates). Retention moves to pg_cron.
--
-- Raw rows are kept 48h. Anything older is represented by pc_metrics_hourly,
-- an avg+max rollup per metric per machine per hour, kept 90 days. An hour of
-- 60s samples is 60 rows collapsed to one, so 90 days of history costs roughly
-- what 36 hours of raw did.
--
-- Depends on: 0094 (machine_id).
-- Rollback:
--   SELECT cron.unschedule('pc_metrics_rollup');
--   SELECT cron.unschedule('pc_metrics_prune');
--   DROP FUNCTION pc_metrics_prune();
--   DROP FUNCTION pc_metrics_rollup(int);
--   DROP TABLE pc_metrics_hourly;

create extension if not exists pg_cron;

create table if not exists pc_metrics_hourly (
  machine_id                text        not null,
  -- Hour start, UTC. date_trunc('hour', ...) of the samples folded into it.
  bucket                    timestamptz not null,
  -- How many raw rows this bucket represents. A short bucket is a bucket the
  -- agent was partly offline for, and the dashboard can say so.
  samples                   integer     not null,
  cpu_usage_avg             numeric,
  cpu_usage_max             numeric,
  cpu_temp_avg              numeric,
  cpu_temp_max              numeric,
  cpu_clock_mhz_avg         numeric,
  cpu_clock_mhz_max         numeric,
  gpu_usage_avg             numeric,
  gpu_usage_max             numeric,
  gpu_temp_avg              numeric,
  gpu_temp_max              numeric,
  gpu_vram_used_mb_avg      numeric,
  gpu_vram_used_mb_max      numeric,
  -- Capacities, not measurements. Carried as max so the dashboard has a
  -- denominator to draw the used-versus-total bars against.
  gpu_vram_total_mb_max     numeric,
  ram_used_gb_avg           numeric,
  ram_used_gb_max           numeric,
  ram_total_gb_max          numeric,
  network_upload_mbps_avg   numeric,
  network_upload_mbps_max   numeric,
  network_download_mbps_avg numeric,
  network_download_mbps_max numeric,
  primary key (machine_id, bucket)
);

alter table pc_metrics_hourly enable row level security;
drop policy if exists "deny all" on pc_metrics_hourly;
create policy "deny all" on pc_metrics_hourly as restrictive using (false);

grant all on pc_metrics_hourly to service_role;

create index if not exists pc_metrics_hourly_bucket_idx
  on pc_metrics_hourly (bucket desc);

-- Recomputes the last `hours_back` buckets from raw. Re-running is always safe
-- and always correct: each bucket is derived wholly from the raw rows still
-- present, so the in-progress hour simply gets sharper on each pass.
--
-- The window must stay comfortably inside the 48h raw retention, or a bucket
-- would be recomputed from rows that have already been pruned and overwrite a
-- complete aggregate with a partial one.
create or replace function pc_metrics_rollup(hours_back integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  insert into pc_metrics_hourly (
    machine_id, bucket, samples,
    cpu_usage_avg, cpu_usage_max,
    cpu_temp_avg, cpu_temp_max,
    cpu_clock_mhz_avg, cpu_clock_mhz_max,
    gpu_usage_avg, gpu_usage_max,
    gpu_temp_avg, gpu_temp_max,
    gpu_vram_used_mb_avg, gpu_vram_used_mb_max, gpu_vram_total_mb_max,
    ram_used_gb_avg, ram_used_gb_max, ram_total_gb_max,
    network_upload_mbps_avg, network_upload_mbps_max,
    network_download_mbps_avg, network_download_mbps_max
  )
  select
    machine_id,
    date_trunc('hour', recorded_at) as bucket,
    count(*)::integer,
    -- avg() and max() skip NULLs rather than poisoning the aggregate, so a
    -- metric that is null for part of an hour still yields a real average of
    -- the samples that did report.
    avg(cpu_usage), max(cpu_usage),
    avg(cpu_temp), max(cpu_temp),
    avg(cpu_clock_mhz), max(cpu_clock_mhz),
    avg(gpu_usage), max(gpu_usage),
    avg(gpu_temp), max(gpu_temp),
    avg(gpu_vram_used_mb), max(gpu_vram_used_mb), max(gpu_vram_total_mb),
    avg(ram_used_gb), max(ram_used_gb), max(ram_total_gb),
    avg(network_upload_mbps), max(network_upload_mbps),
    avg(network_download_mbps), max(network_download_mbps)
  from pc_metrics
  where recorded_at >= date_trunc('hour', now() - make_interval(hours => hours_back))
  group by machine_id, date_trunc('hour', recorded_at)
  on conflict (machine_id, bucket) do update set
    samples                   = excluded.samples,
    cpu_usage_avg             = excluded.cpu_usage_avg,
    cpu_usage_max             = excluded.cpu_usage_max,
    cpu_temp_avg              = excluded.cpu_temp_avg,
    cpu_temp_max              = excluded.cpu_temp_max,
    cpu_clock_mhz_avg         = excluded.cpu_clock_mhz_avg,
    cpu_clock_mhz_max         = excluded.cpu_clock_mhz_max,
    gpu_usage_avg             = excluded.gpu_usage_avg,
    gpu_usage_max             = excluded.gpu_usage_max,
    gpu_temp_avg              = excluded.gpu_temp_avg,
    gpu_temp_max              = excluded.gpu_temp_max,
    gpu_vram_used_mb_avg      = excluded.gpu_vram_used_mb_avg,
    gpu_vram_used_mb_max      = excluded.gpu_vram_used_mb_max,
    gpu_vram_total_mb_max     = excluded.gpu_vram_total_mb_max,
    ram_used_gb_avg           = excluded.ram_used_gb_avg,
    ram_used_gb_max           = excluded.ram_used_gb_max,
    ram_total_gb_max          = excluded.ram_total_gb_max,
    network_upload_mbps_avg   = excluded.network_upload_mbps_avg,
    network_upload_mbps_max   = excluded.network_upload_mbps_max,
    network_download_mbps_avg = excluded.network_download_mbps_avg,
    network_download_mbps_max = excluded.network_download_mbps_max;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Rolls up before pruning, so no raw row is ever discarded without first being
-- represented in a bucket — even if the rollup job has been failing.
create or replace function pc_metrics_prune()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  perform pc_metrics_rollup(49);

  delete from pc_metrics where recorded_at < now() - interval '48 hours';
  get diagnostics removed = row_count;

  delete from pc_metrics_hourly where bucket < now() - interval '90 days';

  return removed;
end;
$$;

-- Every 10 minutes: the 24h view reads from the rollup, so the current partial
-- hour needs to stay close to live.
select cron.schedule(
  'pc_metrics_rollup',
  '*/10 * * * *',
  $$select pc_metrics_rollup(3)$$
);

-- Daily, off-peak. Nothing about 48h retention needs finer granularity.
select cron.schedule(
  'pc_metrics_prune',
  '15 3 * * *',
  $$select pc_metrics_prune()$$
);

-- Seed the rollup from whatever raw history exists right now, so the 24h and
-- 7d views are not empty until the first scheduled run.
select pc_metrics_rollup(24 * 90);
