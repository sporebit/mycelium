-- ---------------------------------------------------------------------------
-- Sub-task support on tasks. One level of nesting (enforced in API layer).
-- ON DELETE CASCADE: deleting a parent removes its sub-tasks too —
-- sub-tasks don't make sense without their parent.
-- ---------------------------------------------------------------------------
alter table tasks
  add column if not exists parent_task_id uuid
  references tasks(id) on delete cascade;

create index if not exists tasks_parent_idx
  on tasks(parent_task_id)
  where parent_task_id is not null;
