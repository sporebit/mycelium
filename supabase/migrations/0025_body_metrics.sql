-- 0025 — extend body_metrics for the smart scales bridge
--
-- body_metrics already exists from 0005 with: id, user_id, date,
-- weight, weight_unit, body_fat_pct, muscle_mass_kg, waist_cm,
-- notes, created_at.
--
-- The Apple Health bridge wants to record richer scale output, and
-- needs a `source` flag so manually-entered rows can be told apart
-- from auto-synced ones. recorded_at distinguishes the moment the
-- scale captured the reading from the row insert time.

alter table body_metrics
  add column if not exists bone_mass_kg   numeric,
  add column if not exists water_percent  numeric,
  add column if not exists source         text        not null default 'manual'
    check (source in ('apple_health', 'manual', 'scale_ble')),
  add column if not exists recorded_at    timestamptz;

-- Backfill recorded_at from the existing date column so historical
-- rows aren't NULL after this migration.
update body_metrics
   set recorded_at = (date::timestamp at time zone 'UTC')
 where recorded_at is null;

create index if not exists body_metrics_user_recorded_at_idx
  on body_metrics (user_id, recorded_at desc);
