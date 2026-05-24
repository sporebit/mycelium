import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { URGENCIES, type Task, type TaskUrgency } from "@/lib/types/task";

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
  const status = (url.searchParams.get("status") ?? "open") as
    | "open"
    | "done"
    | "all";
  const urgency = url.searchParams.get("urgency");
  const entityId = url.searchParams.get("entity_id");
  const includeChildren = url.searchParams.get("include_children") === "true";

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("user_id", uid)
      .order("priority_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (status === "open") q = q.is("completed_at", null);
    else if (status === "done") q = q.not("completed_at", "is", null);

    if (urgency && URGENCIES.includes(urgency as TaskUrgency)) {
      q = q.eq("urgency", urgency);
    }
    if (entityId) q = q.eq("entity_id", entityId);
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
  key?: boolean;
  priority_score?: number;
  tags?: string[];
  due_date?: string | null;
  time_estimate_min?: number | null;
  owner?: string;
  entity_id?: string | null;
  parent_task_id?: string | null;
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
    let inheritedTags: string[] | null = null;
    if (body.parent_task_id) {
      const { data: parent, error: parentErr } = await supabase
        .from("tasks")
        .select("id, urgency, entity_id, tags, parent_task_id")
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
      inheritedTags = (parent.tags as string[] | null) ?? null;
    }

    const insertPayload = {
      user_id: uid,
      title,
      description: body.description ?? null,
      urgency:
        body.urgency && URGENCIES.includes(body.urgency)
          ? body.urgency
          : (inheritedUrgency ?? "today"),
      key: typeof body.key === "boolean" ? body.key : false,
      priority_score:
        typeof body.priority_score === "number" ? body.priority_score : 0.5,
      tags: Array.isArray(body.tags) ? body.tags : inheritedTags,
      due_date: body.due_date ?? null,
      time_estimate_min:
        typeof body.time_estimate_min === "number"
          ? body.time_estimate_min
          : null,
      owner: body.owner ?? uid,
      entity_id:
        body.entity_id !== undefined ? body.entity_id : inheritedEntityId,
      parent_task_id: parentTaskId,
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert(insertPayload)
      .select(TASK_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");

    return NextResponse.json({
      task: serializeTask(data as Parameters<typeof serializeTask>[0]),
    });
  } catch (err) {
    console.error("[/api/tasks POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
