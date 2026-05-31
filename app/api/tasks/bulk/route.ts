import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import {
  URGENCIES,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
  type TaskUrgency,
} from "@/lib/types/task";
import { logTaskActivity } from "@/lib/task-activity";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "status",
  "urgency",
  "due_date",
  "project_id",
  "tags",
  "context_where",
  "context_device",
  "context_energy",
  "context_tag",
]);

type Body = {
  ids?: string[];
  patch?: Record<string, unknown>;
};

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/**
 * Apply the same patch to many tasks at once. Used by drag-to-schedule
 * on the calendar view (bulk due_date update), the bulk action bar
 * (status / urgency / project), and any other surface that needs a
 * one-shot update across a selection.
 */
export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((s) => typeof s === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json(
      { error: "too many ids (max 200)" },
      { status: 400 },
    );
  }
  const rawPatch = body.patch ?? {};

  // Whitelist the patch fields we accept in bulk. Anything outside the
  // allow-list is silently dropped — the single-task PATCH endpoint
  // already covers the long tail.
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawPatch)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k === "status" && !TASK_STATUSES.includes(v as TaskStatus)) continue;
    if (k === "urgency" && v !== null && !URGENCIES.includes(v as TaskUrgency))
      continue;
    patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid patch fields" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  // Mirror the single-task endpoint's status ↔ completed_at coupling
  // so dragging a card to/from Completed via bulk stays consistent.
  if ("status" in patch && !("completed_at" in patch)) {
    if (patch.status === "completed") {
      patch.completed_at = new Date().toISOString();
    } else {
      patch.completed_at = null;
    }
  }

  try {
    const supabase = createServerClient();

    // Snapshot "before" so we can log activity rows for each changed task.
    const { data: beforeRows } = await supabase
      .from("tasks")
      .select(
        "id, status, urgency, due_date, project_id, tags, context_where, context_device, context_energy, context_tag",
      )
      .eq("user_id", uid)
      .is("deleted_at", null)
      .in("id", ids);
    const beforeById = new Map<string, Record<string, unknown>>();
    for (const r of (beforeRows ?? []) as Array<Record<string, unknown>>) {
      beforeById.set(r.id as string, r);
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("user_id", uid)
      .is("deleted_at", null)
      .in("id", ids)
      .select(TASK_SELECT);
    if (error) throw error;

    const updated = ((data ?? []) as unknown[]).map((row) =>
      serializeTask(row as Parameters<typeof serializeTask>[0]),
    ) as Task[];

    // Activity log — soft-fail. Errors here shouldn't block the API
    // response since the data is already persisted.
    void Promise.all(
      updated.map((t) =>
        logTaskActivity(
          supabase,
          uid,
          t.id,
          beforeById.get(t.id) ?? {},
          patch,
        ),
      ),
    );

    return NextResponse.json({ tasks: updated, updated: updated.length });
  } catch (err) {
    console.error("[/api/tasks/bulk POST]", err);
    return NextResponse.json({ error: "bulk update failed" }, { status: 500 });
  }
}
