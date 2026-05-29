-- Migration: capture review workflow — reviewed_at + discarded_at on raw_captures.
-- Depends on: 0001 (raw_captures)
-- Rollback: ALTER TABLE raw_captures
--             DROP COLUMN reviewed_at,
--             DROP COLUMN discarded_at;
--           DROP INDEX IF EXISTS raw_captures_needs_review_idx;

alter table raw_captures
  add column if not exists reviewed_at  timestamptz,
  add column if not exists discarded_at timestamptz;

-- Partial index for the NEEDS REVIEW tab + the dashboard count card.
-- Covers the "older than an hour, never reviewed, never discarded"
-- branch of the predicate, which is the largest in practice.
create index if not exists raw_captures_needs_review_idx
  on raw_captures (user_id, created_at desc)
  where reviewed_at is null and discarded_at is null;
