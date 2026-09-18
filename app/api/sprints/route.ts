import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { londonNow } from "@/lib/tickets/categories";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { SPRINT_SELECT, summarise, velocity, type SprintRow } from "@/lib/tickets/sprints";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/sprints?project=<id> — the project's sprints (summarised) + velocity. */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project");
  try {
    const supabase = await createUserClient();
    let q = supabase.from("sprints").select(SPRINT_SELECT).order("starts_on", { ascending: false }).limit(50);
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) throw error;
    const today = londonNow().date;
    const sprints = await Promise.all(((data ?? []) as SprintRow[]).map((s) => summarise(supabase, s, today)));
    const vel = projectId ? await velocity(supabase, projectId) : [];
    return NextResponse.json({ sprints, velocity: vel, today });
  } catch (err) {
    console.error("[/api/sprints GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** POST { project_id, name, starts_on, ends_on, goal?, activate? } */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  const body = await readJson<{ project_id?: string; name?: string; starts_on?: string; ends_on?: string; goal?: string; activate?: boolean }>(req);
  if (!body?.project_id || !body.name?.trim() || !DATE_RE.test(body.starts_on ?? "") || !DATE_RE.test(body.ends_on ?? "")) {
    return NextResponse.json({ error: "project_id, name, starts_on, ends_on required" }, { status: 400 });
  }
  if (body.ends_on! < body.starts_on!) return NextResponse.json({ error: "ends_on before starts_on" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    if (body.activate) {
      const { data: active } = await supabase.from("sprints").select("id").eq("project_id", body.project_id).eq("status", "active").limit(1);
      if (active?.length) return NextResponse.json({ error: "this project already has an active sprint; close it first" }, { status: 409 });
    }
    const { data, error } = await supabase
      .from("sprints")
      .insert({
        project_id: body.project_id,
        name: body.name.trim().slice(0, 80),
        goal: typeof body.goal === "string" ? body.goal.trim().slice(0, 500) || null : null,
        starts_on: body.starts_on,
        ends_on: body.ends_on,
        status: body.activate ? "active" : "planned",
      })
      .select(SPRINT_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ sprint: await summarise(supabase, data as SprintRow, londonNow().date) }, { status: 201 });
  } catch (err) {
    console.error("[/api/sprints POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
