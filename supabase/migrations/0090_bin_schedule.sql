-- Bin collection schedule: config + garden waste seasons.
-- Collection dates and types are computed (see lib/bins/schedule.ts), not stored.
-- bin_google_events is a small sync journal so re-syncs update rather than duplicate.

CREATE TABLE IF NOT EXISTS bin_schedule_config (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_day_of_week smallint NOT NULL,
  anchor_date            date     NOT NULL,
  anchor_type            text     NOT NULL CHECK (anchor_type IN ('recycling', 'black')),
  created_at             timestamptz NOT NULL DEFAULT now()
);

INSERT INTO bin_schedule_config (collection_day_of_week, anchor_date, anchor_type)
SELECT 3, DATE '2025-12-03', 'recycling'
WHERE NOT EXISTS (SELECT 1 FROM bin_schedule_config);

CREATE TABLE IF NOT EXISTS bin_garden_seasons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_label   text NOT NULL,
  season_start date NOT NULL,
  season_end   date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO bin_garden_seasons (year_label, season_start, season_end)
SELECT '2026', DATE '2026-03-11', DATE '2026-11-18'
WHERE NOT EXISTS (SELECT 1 FROM bin_garden_seasons WHERE year_label = '2026');

-- Sync journal: maps a computed collection_date to the Google event we created.
-- Not part of the schedule domain — pure bookkeeping to keep sync idempotent.
CREATE TABLE IF NOT EXISTS bin_google_events (
  collection_date date PRIMARY KEY,
  google_event_id text NOT NULL,
  event_type      text NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
