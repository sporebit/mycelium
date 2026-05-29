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

const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "status",
  "colour",
]);

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const project = data as Project;
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("project_id", id)
      .is("completed_at", null);
    project.task_count = count ?? 0;
    return NextResponse.json({ project });
  } catch (err) {
    console.error("[/api/projects/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
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
    if (
      k === "status" &&
      v !== null &&
      !PROJECT_STATUSES.includes(v as ProjectStatus)
    ) {
      continue;
    }
    if (k === "name" && typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) continue;
      update.name = trimmed;
      continue;
    }
    update[k] = v;
  }
  update.updated_at = new Date().toISOString();

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("projects")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(PROJECT_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ project: data as Project });
  } catch (err) {
    console.error("[/api/projects/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "true";

  try {
    const supabase = createServerClient();
    if (hard) {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id)
        .eq("user_id", uid);
      if (error) throw error;
      return NextResponse.json({ ok: true, mode: "hard" });
    }
    // Soft delete = mark archived.
    const { data, error } = await supabase
      .from("projects")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", uid)
      .select(PROJECT_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, mode: "soft", project: data as Project });
  } catch (err) {
    console.error("[/api/projects/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
