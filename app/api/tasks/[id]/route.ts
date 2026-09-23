import { whenFieldsFromBody } from "@/lib/tickets/server";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/user";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import {
  TASK_STATUSES,
  type Task,
  type TaskActivity,
  type TaskComment,
  type TaskStatus,
  type LinkedCapture,
} from "@/lib/types/task";
import { extractNameMentions } from "@/lib/people/regex-extract";
import { recordMention, resolveMention } from "@/lib/people/resolve-mention";
import { logTaskActivity } from "@/lib/task-activity";
import { pushTaskToGoogle, removeGoogleEvent } from "@/lib/google/sync";
import {
  LEGACY_HANDLED_KEYS,
  isTicketCategory,
  statusIdFor,
  ticketFieldsFromBody,
} from "@/lib/tickets/server";

async function rebuildTaskMentions(
  supabase: SupabaseClient,
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
        const res = await resolveMention(supabase, e.name_hint);
        await recordMention(supabase, res, { type: "task", id: taskId });
      } catch (err) {
        console.error("[tasks PATCH] mention soft-fail per-extraction:", err);
      }
    }
  } catch (err) {
    console.error("[tasks PATCH] mention rebuild failed:", err);
  }
}

export const runtime = "nodejs";

// `urgency` left the list with tickets spec §18 R4 (unwritten for one release).
const ALLOWED_FIELDS = new Set([
  "title",
  "description",
  "status",
  "key",
  "priority_score",
  "tags",
  "due_date",
  "scheduled_at",
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
// Tickets Part B — the compat route accepts the new columns too (validated
// by ticketFieldsFromBody), so there is one write path. `category` is
// translated to status_id below; the 0117 trigger keeps `status`,
// `completed_at` and `cancelled_at` in step.

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { data: row, error } = await supabase
      .from("tickets")
      .select(TASK_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const task = serializeTask(row as Parameters<typeof serializeTask>[0]);

    const [comments, activity, subRows, captures] = await Promise.all([
      supabase
        .from("ticket_comments")
        .select("id, task_id:ticket_id, body, created_at, updated_at")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("ticket_activity")
        .select("id, task_id:ticket_id, action, field, from_value, to_value, created_at")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("tickets")
        .select(TASK_SELECT)
        .is("deleted_at", null)
        .eq("parent_task_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("raw_captures")
        .select("id, source, raw_text, created_at")
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
    if (k === "status" && !TASK_STATUSES.includes(v as TaskStatus)) {
      continue;
    }
    update[k] = v;
  }
  Object.assign(update, ticketFieldsFromBody(body, LEGACY_HANDLED_KEYS), whenFieldsFromBody(body));
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
    const supabase = await createUserClient();

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
          .from("tickets")
          .select("parent_task_id")
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
          .from("tickets")
          .select("id")
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
      .from("tickets")
      .select(
        "space_id, status, urgency, project_id, due_date, scheduled_at, time_estimate_min, key, owner, entity_id, title, description, parent_task_id, tags, status_id, someday, urgent, points, where_ctx, tools, time_window, scheduled_on, deadline_on, assignee_id, waiting_on_person_id, kind",
      )
      .eq("id", id)
      .maybeSingle();

    // `category` → the space's status row for it (Part B).
    if (isTicketCategory(body.category) && beforeRow?.space_id) {
      const sid = await statusIdFor(supabase, beforeRow.space_id as string, body.category);
      if (sid) update.status_id = sid;
    }

    const { data, error } = await supabase
      .from("tickets")
      .update(update)
      .eq("id", id)
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
        row.id,
        row.title,
        row.description
      );
    }

    // Google Calendar sync (fire-and-forget)
    const row = data as unknown as {
      id: string; title: string; description: string | null;
      scheduled_at: string | null; google_event_id: string | null;
      completed_at: string | null;
    };
    if (update.status === "completed" || update.completed_at) {
      removeGoogleEvent(supabase, "tasks", row.google_event_id).catch(() => {});
    } else if (row.scheduled_at && ("scheduled_at" in update || "title" in update || "description" in update)) {
      pushTaskToGoogle(supabase, {
        id: row.id,
        title: row.title,
        description: row.description,
        scheduled_at: row.scheduled_at,
        google_event_id: row.google_event_id,
      }).catch(() => {});
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
  const { id } = await ctx.params;

  try {
    const supabase = await createUserClient();

    const { data: existing } = await supabase
      .from("tickets")
      .select("google_event_id")
      .eq("id", id)
      .maybeSingle();

    // FK is ON DELETE CASCADE, so sub-tasks go with the parent automatically.
    const { error } = await supabase
      .from("tickets")
      .delete()
      .eq("id", id);
    if (error) throw error;

    if (existing?.google_event_id) {
      removeGoogleEvent(supabase, "tasks", existing.google_event_id).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/tasks/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
