import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/lib/types/task";

type RawTaskRow = Omit<Task, "entity_name"> & {
  entities: { name: string } | { name: string }[] | null;
};

export const TASK_SELECT =
  "id, user_id, title, description, urgency, key, priority_score, time_estimate_min, tags, due_date, owner, entity_id, completed_at, created_at, updated_at, entities(name)";

export function serializeTask(row: RawTaskRow): Task {
  const ent = Array.isArray(row.entities) ? row.entities[0] : row.entities;
  const { entities: _entities, ...rest } = row;
  void _entities;
  return { ...rest, entity_name: ent?.name ?? null };
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
