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
import { extractNameMentions } from "@/lib/people/regex-extract";
import { recordMention, resolveMention } from "@/lib/people/resolve-mention";

type Supabase = ReturnType<typeof createServerClient>;

/**
 * Soft-failure mention extraction for tasks created/edited outside the
 * capture pipeline. Mirrors the writeCapture behaviour — any error is
 * logged and the task POST/PATCH still succeeds.
 */
async function extractTaskMentions(
  supabase: Supabase,
  userId: string,
  taskId: string,
  title: string,
  description: string | null
): Promise<void> {
  try {
    const text = `${title} ${description ?? ""}`.trim();
    if (!text) return;
    const extractions = extractNameMentions(text);
    for (const e of extractions) {
      try {
        const res = await resolveMention(supabase, userId, e.name_hint);
        await recordMention(supabase, userId, res, {
          type: "task",
          id: taskId,
        });
      } catch (err) {
        console.error("[tasks] mention soft-fail per-extraction:", err);
      }
    }
  } catch (err) {
    console.error("[tasks] mention extraction failed:", err);
  }
}

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  const url = new URL(req.url);
  const rawStatus = (url.searchParams.get("status") ?? "open") as
    | "open"
    | "done"
    | "all";
  // include_completed=true overrides status=open so the existing call
  // sites can opt in with a single extra param instead of restructuring
  // their query string.
  const includeCompleted =
    url.searchParams.get("include_completed") === "true";
  const status = includeCompleted && rawStatus === "open" ? "all" : rawStatus;
  const urgency = url.searchParams.get("urgency");
  const entityId = url.searchParams.get("entity_id");
  const projectId = url.searchParams.get("project_id");
  const includeChildren = url.searchParams.get("include_children") === "true";

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("user_id", uid)
      .is("deleted_at", null)
      .order("priority_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (status === "open") q = q.is("completed_at", null);
    else if (status === "done") q = q.not("completed_at", "is", null);

    if (urgency && URGENCIES.includes(urgency as TaskUrgency)) {
      q = q.eq("urgency", urgency);
    }
    if (entityId) q = q.eq("entity_id", entityId);
    if (projectId === "null") q = q.is("project_id", null);
    else if (projectId) q = q.eq("project_id", projectId);
    if (includeChildren) {
      q = q.is("parent_task_id", null);
    }

    const { data, error } = await q;
    if (error) throw error;

    const tasks: Task[] = (data ?? []).map((row) =>
      serializeTask(row as Parameters<typeof serializeTask>[0])
    );

    if (includeChildren && tasks.length > 0) {
      const parentIds = tasks.map((t) => t.id);
      const { data: childRows, error: childErr } = await supabase
        .from("tasks")
        .select(TASK_SELECT)
        .eq("user_id", uid)
        .is("deleted_at", null)
        .in("parent_task_id", parentIds)
        .order("created_at", { ascending: true });
      if (childErr) throw childErr;

      const byParent = new Map<string, Task[]>();
      for (const row of childRows ?? []) {
        const child = serializeTask(
          row as Parameters<typeof serializeTask>[0]
        );
        if (!child.parent_task_id) continue;
        const list = byParent.get(child.parent_task_id) ?? [];
        list.push(child);
        byParent.set(child.parent_task_id, list);
      }
      for (const t of tasks) {
        t.sub_tasks = byParent.get(t.id) ?? [];
      }
    }

    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("[/api/tasks GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  title?: string;
  description?: string;
  urgency?: TaskUrgency;
  status?: TaskStatus;
  key?: boolean;
  priority_score?: number;
  tags?: string[];
  due_date?: string | null;
  scheduled_at?: string | null;
  time_estimate_min?: number | null;
  owner?: string;
  entity_id?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  context_where?: string | null;
  context_device?: string | null;
  context_energy?: "low" | "medium" | "high" | null;
  context_tag?: string | null;
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Sub-task validation + inheritance
    let parentTaskId: string | null = null;
    let inheritedUrgency: TaskUrgency | null = null;
    let inheritedEntityId: string | null = null;
    let inheritedProjectId: string | null = null;
    let inheritedTags: string[] | null = null;
    if (body.parent_task_id) {
      const { data: parent, error: parentErr } = await supabase
        .from("tasks")
        .select("id, urgency, entity_id, project_id, tags, parent_task_id")
        .eq("user_id", uid)
        .eq("id", body.parent_task_id)
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
      parentTaskId = parent.id;
      inheritedUrgency = (parent.urgency as TaskUrgency | null) ?? null;
      inheritedEntityId = (parent.entity_id as string | null) ?? null;
      inheritedProjectId = (parent.project_id as string | null) ?? null;
      inheritedTags = (parent.tags as string[] | null) ?? null;
    }

    // Auto-suggest context from past task history when the caller
    // didn't pass any context fields explicitly. The suggester runs
    // soft — failure leaves all four nulled so the post still succeeds.
    let suggestedWhere: string | null = body.context_where ?? null;
    let suggestedDevice: string | null = body.context_device ?? null;
    let suggestedEnergy: "low" | "medium" | "high" | null =
      body.context_energy ?? null;
    let suggestedTag: string | null = body.context_tag ?? null;
    if (
      body.context_where === undefined &&
      body.context_device === undefined &&
      body.context_energy === undefined &&
      body.context_tag === undefined
    ) {
      try {
        const { suggestContext } = await import("@/lib/compost/suggest-context");
        const suggestion = await suggestContext(supabase, uid, title);
        suggestedWhere = suggestion.where;
        suggestedDevice = suggestion.device;
        suggestedEnergy = suggestion.energy;
        suggestedTag = suggestion.tag;
      } catch (err) {
        console.error("[tasks POST] suggestContext soft-fail:", err);
      }
    }

    const insertPayload = {
      user_id: uid,
      title,
      description: body.description ?? null,
      urgency:
        body.urgency && URGENCIES.includes(body.urgency)
          ? body.urgency
          : (inheritedUrgency ?? "today"),
      status:
        body.status && TASK_STATUSES.includes(body.status)
          ? body.status
          : "new",
      key: typeof body.key === "boolean" ? body.key : false,
      priority_score:
        typeof body.priority_score === "number" ? body.priority_score : 0.5,
      tags: Array.isArray(body.tags) ? body.tags : inheritedTags,
      due_date: body.due_date ?? null,
      scheduled_at: body.scheduled_at ?? null,
      time_estimate_min:
        typeof body.time_estimate_min === "number"
          ? body.time_estimate_min
          : null,
      owner: body.owner ?? uid,
      entity_id:
        body.entity_id !== undefined ? body.entity_id : inheritedEntityId,
      project_id:
        body.project_id !== undefined ? body.project_id : inheritedProjectId,
      parent_task_id: parentTaskId,
      context_where: suggestedWhere,
      context_device: suggestedDevice,
      context_energy: suggestedEnergy,
      context_tag: suggestedTag,
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert(insertPayload)
      .select(TASK_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");

    // Mention extraction (soft-fail). Mirrors capture-pipeline behaviour.
    await extractTaskMentions(
      supabase,
      uid,
      (data as { id: string }).id,
      title,
      body.description ?? null
    );

    return NextResponse.json({
      task: serializeTask(data as Parameters<typeof serializeTask>[0]),
    });
  } catch (err) {
    console.error("[/api/tasks POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
