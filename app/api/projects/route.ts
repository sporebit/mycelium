import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
} from "@/lib/types/project";

export const runtime = "nodejs";

const PROJECT_SELECT =
  "id, user_id, name, description, status, colour, created_at, updated_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (status && PROJECT_STATUSES.includes(status as ProjectStatus)) {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) throw error;
    const projects = (data ?? []) as Project[];

    // Task counts per project (open tasks only)
    if (projects.length > 0) {
      const ids = projects.map((p) => p.id);
      const { data: taskRows } = await supabase
        .from("tasks")
        .select("id, project_id")
        .eq("user_id", uid)
        .is("deleted_at", null)
        .is("completed_at", null)
        .in("project_id", ids);
      const counts = new Map<string, number>();
      for (const row of (taskRows ?? []) as Array<{ project_id: string }>) {
        counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
      }
      for (const p of projects) p.task_count = counts.get(p.id) ?? 0;
    }

    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[/api/projects GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  colour?: string | null;
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

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const insertPayload = {
      user_id: uid,
      name,
      description: body.description ?? null,
      status:
        body.status && PROJECT_STATUSES.includes(body.status)
          ? body.status
          : "active",
      colour: body.colour ?? null,
    };
    const { data, error } = await supabase
      .from("projects")
      .insert(insertPayload)
      .select(PROJECT_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");
    return NextResponse.json({ project: data as Project });
  } catch (err) {
    console.error("[/api/projects POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
