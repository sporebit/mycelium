CREATE TABLE pc_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  cpu_usage numeric,
  cpu_temp numeric,
  cpu_clock_mhz numeric,
  gpu_usage numeric,
  gpu_temp numeric,
  gpu_vram_used_mb numeric,
  gpu_vram_total_mb numeric,
  ram_used_gb numeric,
  ram_total_gb numeric,
  network_upload_mbps numeric,
  network_download_mbps numeric,
  uptime_seconds bigint,
  drives jsonb,
  raw jsonb
);

CREATE INDEX pc_metrics_recorded_at_idx ON pc_metrics (recorded_at DESC);
