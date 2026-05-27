-- ---------------------------------------------------------------------------
-- Phase 4: per-user dashboard layouts.
--   One row per (user, card_key). Position drives left-to-right / top-to-
--   bottom flow; width is the desktop grid span (1-3); hidden=true keeps
--   the row but removes the card from the grid.
-- ---------------------------------------------------------------------------

create table if not exists dashboard_layouts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  card_key    text        not null,
  position    int         not null default 0,
  width       int         not null default 1 check (width between 1 and 3),
  hidden      boolean     not null default false,
  updated_at  timestamptz not null default now(),
  unique (user_id, card_key)
);
alter table dashboard_layouts enable row level security;
create policy "deny all" on dashboard_layouts as restrictive using (false);
create index if not exists dashboard_layouts_user_idx
  on dashboard_layouts(user_id);

grant all on dashboard_layouts to service_role;
