import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import {
  URGENCIES,
  TASK_STATUSES,
  type Task,
  type TaskActivity,
  type TaskComment,
  type TaskStatus,
  type TaskUrgency,
  type LinkedCapture,
} from "@/lib/types/task";
import { extractNameMentions } from "@/lib/people/regex-extract";
import { recordMention, resolveMention } from "@/lib/people/resolve-mention";
import { logTaskActivity } from "@/lib/task-activity";

type Supabase = ReturnType<typeof createServerClient>;

async function rebuildTaskMentions(
  supabase: Supabase,
  userId: string,
  taskId: string,
  title: string,
  description: string | null
): Promise<void> {
  try {
    // Clean slate: remove all existing task mentions for this row.
    await supabase
      .from("people_mentions")
      .delete()
      .eq("source_type", "task")
      .eq("source_id", taskId);

    const text = `${title} ${description ?? ""}`.trim();
    if (!text) return;
    const extractions = extractNameMentions(text);
    for (const e of extractions) {
      try {
        const res = await resolveMention(supabase, userId, e.name_hint);
        await recordMention(supabase, userId, res, { type: "task", id: taskId });
      } catch (err) {
        console.error("[tasks PATCH] mention soft-fail per-extraction:", err);
      }
    }
  } catch (err) {
    console.error("[tasks PATCH] mention rebuild failed:", err);
  }
}

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "title",
  "description",
  "urgency",
  "status",
  "key",
  "priority_score",
  "tags",
  "due_date",
  "time_estimate_min",
  "owner",
  "entity_id",
  "project_id",
  "completed_at",
  "parent_task_id",
  "context_where",
  "context_device",
  "context_energy",
  "context_tag",
]);

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { data: row, error } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("user_id", uid)
      .eq("id", id)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const task = serializeTask(row as Parameters<typeof serializeTask>[0]);

    const [comments, activity, subRows, captures] = await Promise.all([
      supabase
        .from("task_comments")
        .select("id, task_id, user_id, body, created_at, updated_at")
        .eq("task_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("task_activity")
        .select("id, task_id, user_id, action, field, from_value, to_value, created_at")
        .eq("task_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("tasks")
        .select(TASK_SELECT)
        .eq("user_id", uid)
        .is("deleted_at", null)
        .eq("parent_task_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("raw_captures")
        .select("id, source, raw_text, created_at")
        .eq("user_id", uid)
        .is("deleted_at", null)
        .eq("routed_to", "task")
        .eq("routed_id", id)
        .order("created_at", { ascending: false }),
    ]);

    const subtasks: Task[] = (subRows.data ?? []).map((r) =>
      serializeTask(r as Parameters<typeof serializeTask>[0]),
    );

    return NextResponse.json({
      task,
      comments: (comments.data ?? []) as TaskComment[],
      activity: (activity.data ?? []) as TaskActivity[],
      subtasks,
      linked_captures: (captures.data ?? []) as LinkedCapture[],
    });
  } catch (err) {
    console.error("[/api/tasks/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k === "urgency" && v !== null && !URGENCIES.includes(v as TaskUrgency)) {
      continue;
    }
    if (k === "status" && !TASK_STATUSES.includes(v as TaskStatus)) {
      continue;
    }
    update[k] = v;
  }
  update.updated_at = new Date().toISOString();

  // Keep status and completed_at in sync — moving a card to/from the
  // Completed column should reflect on both fields.
  if ("status" in update && !("completed_at" in update)) {
    if (update.status === "completed") {
      update.completed_at = new Date().toISOString();
    } else {
      update.completed_at = null;
    }
  }

  try {
    const supabase = createServerClient();

    // Sub-task validation if parent_task_id is being changed.
    if (Object.prototype.hasOwnProperty.call(update, "parent_task_id")) {
      const newParent = update.parent_task_id;
      if (newParent !== null && typeof newParent !== "string") {
        return NextResponse.json(
          { error: "parent_task_id must be a uuid string or null" },
          { status: 400 }
        );
      }
      if (newParent === id) {
        return NextResponse.json(
          { error: "A task cannot be its own parent." },
          { status: 400 }
        );
      }
      if (newParent !== null) {
        const { data: parent, error: parentErr } = await supabase
          .from("tasks")
          .select("parent_task_id")
          .eq("user_id", uid)
          .eq("id", newParent)
          .maybeSingle();
        if (parentErr || !parent) {
          return NextResponse.json(
            { error: "parent task not found" },
            { status: 400 }
          );
        }
        if (parent.parent_task_id) {
          return NextResponse.json(
            { error: "Sub-tasks cannot have their own sub-tasks." },
            { status: 400 }
          );
        }
        // The task itself cannot be made a sub-task while it still has children.
        const { data: kids } = await supabase
          .from("tasks")
          .select("id")
          .eq("user_id", uid)
          .eq("parent_task_id", id)
          .limit(1);
        if (kids && kids.length > 0) {
          return NextResponse.json(
            {
              error:
                "This task has sub-tasks; it cannot itself become a sub-task.",
            },
            { status: 400 }
          );
        }
      }
    }

    // Capture "before" snapshot for activity logging.
    const { data: beforeRow } = await supabase
      .from("tasks")
      .select(
        "status, urgency, project_id, due_date, time_estimate_min, key, owner, entity_id, title, description, parent_task_id, tags",
      )
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();

    const { data, error } = await supabase
      .from("tasks")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(TASK_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 }
      );
    }

    if (beforeRow) {
      await logTaskActivity(
        supabase,
        uid,
        id,
        beforeRow as Record<string, unknown>,
        update,
      );
    }

    // If title or description changed, rebuild the task's mention links.
    if (
      Object.prototype.hasOwnProperty.call(update, "title") ||
      Object.prototype.hasOwnProperty.call(update, "description")
    ) {
      const row = data as { id: string; title: string; description: string | null };
      await rebuildTaskMentions(
        supabase,
        uid,
        row.id,
        row.title,
        row.description
      );
    }

    return NextResponse.json({
      task: serializeTask(data as Parameters<typeof serializeTask>[0]),
    });
  } catch (err) {
    console.error("[/api/tasks/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;

  try {
    const supabase = createServerClient();
    // FK is ON DELETE CASCADE, so sub-tasks go with the parent automatically.
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/tasks/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
