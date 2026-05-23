import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { URGENCIES, type TaskUrgency } from "@/lib/types/task";

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

    const { data, error } = await q;
    if (error) throw error;

    const tasks = (data ?? []).map((row) =>
      serializeTask(row as Parameters<typeof serializeTask>[0])
    );
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
    const insertPayload = {
      user_id: uid,
      title,
      description: body.description ?? null,
      urgency:
        body.urgency && URGENCIES.includes(body.urgency) ? body.urgency : "today",
      key: typeof body.key === "boolean" ? body.key : false,
      priority_score:
        typeof body.priority_score === "number" ? body.priority_score : 0.5,
      tags: Array.isArray(body.tags) ? body.tags : null,
      due_date: body.due_date ?? null,
      time_estimate_min:
        typeof body.time_estimate_min === "number"
          ? body.time_estimate_min
          : null,
      owner: body.owner ?? uid,
      entity_id: body.entity_id ?? null,
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
