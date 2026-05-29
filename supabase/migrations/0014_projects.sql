-- Migration: Projects as containers for tasks under Compost
-- Depends on: 0001 (created the tasks table)
-- Rollback: ALTER TABLE tasks DROP COLUMN project_id;
--           DROP TABLE projects;

create table if not exists projects (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  name        text        not null,
  description text,
  status      text        not null default 'active'
                          check (status in ('active', 'archived', 'completed')),
  colour      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table projects enable row level security;
create policy "deny all" on projects as restrictive using (false);

create index if not exists projects_user_id_idx on projects (user_id);
create index if not exists projects_status_idx  on projects (status);

alter table tasks
  add column if not exists project_id uuid references projects (id) on delete set null;

create index if not exists tasks_project_id_idx on tasks (project_id);
