import type { SupabaseClient } from "@supabase/supabase-js";

const TRACKED_FIELDS = new Set([
  "status",
  "urgency",
  "project_id",
  "due_date",
  "time_estimate_min",
  "key",
  "owner",
  "entity_id",
  "title",
  "description",
  "parent_task_id",
  "tags",
]);

function stringify(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export async function logTaskActivity(
  supabase: SupabaseClient,
  taskId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  const rows: Array<{
    ticket_id: string;
    action: string;
    field: string;
    from_value: string | null;
    to_value: string | null;
  }> = [];
  for (const field of Object.keys(after)) {
    if (!TRACKED_FIELDS.has(field)) continue;
    const fromVal = before[field];
    const toVal = after[field];
    const fromStr = stringify(fromVal);
    const toStr = stringify(toVal);
    if (fromStr === toStr) continue;
    rows.push({
      ticket_id: taskId,
      action: "update",
      field,
      from_value: fromStr,
      to_value: toStr,
    });
  }
  if (rows.length === 0) return;
  try {
    await supabase.from("ticket_activity").insert(rows);
  } catch (err) {
    console.error("[task_activity] insert failed:", err);
  }
}

export async function logTaskCreated(
  supabase: SupabaseClient,
  taskId: string,
): Promise<void> {
  try {
    await supabase.from("ticket_activity").insert({
      ticket_id: taskId,
      action: "created",
      field: null,
      from_value: null,
      to_value: null,
    });
  } catch (err) {
    console.error("[task_activity] created insert failed:", err);
  }
}
