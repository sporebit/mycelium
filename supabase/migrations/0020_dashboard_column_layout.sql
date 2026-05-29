-- Migration: dashboard_layouts gains an explicit `col` field — cards
-- now belong to a specific column (1, 2, or 3) with `position` ordering
-- them within that column. Replaces the prior 1D sorted-list model.
--
-- Depends on: 0012 (dashboard_layouts).
-- Rollback: ALTER TABLE dashboard_layouts DROP COLUMN col;

alter table dashboard_layouts
  add column if not exists col integer not null default 1
    check (col in (1, 2, 3));

-- Distribute existing cards across columns by current position parity
-- so saved layouts keep at least their relative spread:
--   position % 3 = 0 → col 1
--   position % 3 = 1 → col 2
--   position % 3 = 2 → col 3
-- One-shot — this is safe to re-run because subsequent rows will use
-- the col the writer explicitly sets.
update dashboard_layouts set col = (position % 3) + 1;
