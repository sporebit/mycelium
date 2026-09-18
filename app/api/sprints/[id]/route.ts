import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { londonNow } from "@/lib/tickets/categories";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { SPRINT_SELECT, burndown, closeSprint, summarise, type SprintRow } from "@/lib/tickets/sprints";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function load(supabase: Awaited<ReturnType<typeof createUserClient>>, id: string): Promise<SprintRow | null> {
  const { data } = await supabase.from("sprints").select(SPRINT_SELECT).eq("id", id).maybeSingle();
  return (data as SprintRow | null) ?? null;
}

/** GET — summary + burndown. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const s = await load(supabase, id);
    if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
    const today = londonNow().date;
    const [summary, chart] = await Promise.all([summarise(supabase, s, today), burndown(supabase, s, today)]);
    return NextResponse.json({ sprint: summary, burndown: chart, today });
  } catch (err) {
    console.error("[/api/sprints/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * PATCH { name?, goal?, starts_on?, ends_on?, status?: planned|active|closed, carry_to?: sprint id | null }
 * status = active enforces one active sprint per project; status = closed
 * snapshots velocity and carries unfinished tickets to `carry_to` (or out).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<{ name?: string; goal?: string | null; starts_on?: string; ends_on?: string; status?: string; carry_to?: string | null }>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const s = await load(supabase, id);
    if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
    const today = londonNow().date;

    if (body.status === "closed" && s.status !== "closed") {
      const closed = await closeSprint(supabase, s, typeof body.carry_to === "string" ? body.carry_to : null);
      return NextResponse.json({ sprint: await summarise(supabase, closed, today) });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim().slice(0, 80);
    if (body.goal !== undefined) update.goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 500) || null : null;
    if (typeof body.starts_on === "string" && DATE_RE.test(body.starts_on)) update.starts_on = body.starts_on;
    if (typeof body.ends_on === "string" && DATE_RE.test(body.ends_on)) update.ends_on = body.ends_on;
    if (body.status === "active" || body.status === "planned") {
      if (body.status === "active" && s.status !== "active") {
        const { data: active } = await supabase.from("sprints").select("id").eq("project_id", s.project_id).eq("status", "active").neq("id", s.id).limit(1);
        if (active?.length) return NextResponse.json({ error: "another sprint is active on this project; close it first" }, { status: 409 });
      }
      update.status = body.status;
      if (body.status === "planned") update.closed_at = null;
    }
    const { data, error } = await supabase.from("sprints").update(update).eq("id", s.id).select(SPRINT_SELECT).single();
    if (error || !data) throw error ?? new Error("update failed");
    return NextResponse.json({ sprint: await summarise(supabase, data as SprintRow, today) });
  } catch (err) {
    console.error("[/api/sprints/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

/** DELETE — only a planned sprint; its tickets are unassigned by the FK. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const s = await load(supabase, id);
    if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (s.status !== "planned") return NextResponse.json({ error: "only a planned sprint can be deleted; close it instead" }, { status: 409 });
    const { error } = await supabase.from("sprints").delete().eq("id", s.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/sprints/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
