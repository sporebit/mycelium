-- 0052 — body metrics: arms, thorax, thighs measurements (inches)
alter table body_metrics
  add column if not exists arms_in   numeric,
  add column if not exists thorax_in numeric,
  add column if not exists thighs_in numeric;
