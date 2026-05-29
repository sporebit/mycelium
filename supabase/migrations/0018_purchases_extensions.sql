-- Migration: purchases extensions — wishlist support + project linkage.
-- Depends on: 0017 (purchases) and 0014 (projects).
-- Rollback: ALTER TABLE purchases
--             DROP COLUMN list_type,
--             DROP COLUMN project_id;

alter table purchases
  add column if not exists list_type text not null default 'shopping'
    check (list_type in ('shopping', 'wishlist'));

alter table purchases
  add column if not exists project_id uuid references projects(id)
    on delete set null;

create index if not exists purchases_project_id_idx on purchases (project_id);
