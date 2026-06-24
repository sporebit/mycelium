import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/lib/types/task";

type RawTaskRow = Omit<Task, "entity_name" | "project_name" | "project_colour" | "sub_tasks"> & {
  entities: { name: string } | { name: string }[] | null;
  projects: { name: string; colour: string | null } | { name: string; colour: string | null }[] | null;
};

export const TASK_SELECT =
  "id, user_id, title, description, urgency, status, key, priority_score, time_estimate_min, tags, due_date, scheduled_at, owner, entity_id, project_id, completed_at, created_at, updated_at, parent_task_id, converted_from, context_where, context_device, context_energy, context_tag, google_event_id, entities(name), projects(name, colour)";

export function serializeTask(row: RawTaskRow): Task {
  const ent = Array.isArray(row.entities) ? row.entities[0] : row.entities;
  const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects;
  const { entities: _entities, projects: _projects, ...rest } = row;
  void _entities;
  void _projects;
  return {
    ...rest,
    entity_name: ent?.name ?? null,
    project_name: proj?.name ?? null,
    project_colour: proj?.colour ?? null,
  };
}

export async function fetchTaskById(
  supabase: SupabaseClient,
  userId: string,
  taskId: string
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("user_id", userId)
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return null;
  return serializeTask(data as unknown as RawTaskRow);
}
