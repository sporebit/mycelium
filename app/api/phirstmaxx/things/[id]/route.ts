import { NextRequest, NextResponse } from "next/server";
import { answer, bad, pmRequest } from "@/lib/phirstmaxx/http";
import { proposePlan } from "@/lib/phirstmaxx/plans";
import { rerunResearch } from "@/lib/phirstmaxx/research/pipeline";
import { patchThing, setThingStatus, thingDetail } from "@/lib/phirstmaxx/things";
import { readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/phirstmaxx/things/<id> — the thing, its facts by key with sources, travel per person, the fit list and the next fit. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await pmRequest(req);
  if (!r.ok) return r.res;
  try {
    const d = await thingDetail(r.supabase, r.ctx, id);
    if (!d.ok) return bad(d.error, d.status);
    return NextResponse.json({ ...d.value, people: r.ctx.people.map((p) => ({ id: p.id, name: p.name, colour: p.colour })), me: r.ctx.uid });
  } catch (err) {
    console.error("[/api/phirstmaxx/things/:id GET]", err);
    return bad("fetch failed", 500);
  }
}

/**
 * PATCH — a hand edit: name, kind, min_minutes, max_minutes, indoor,
 * dog_rule, cost_pence, summary, address, stars (the caller's own). The
 * key goes into hand_edited and a "person" fact records it, so research
 * never writes over it (spec §2.4).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const r = await pmRequest(req, body);
  if (!r.ok) return r.res;
  try {
    const out = await patchThing(r.supabase, r.ctx, id, body);
    return out.ok ? NextResponse.json({ thing: out.value }) : bad(out.error, out.status);
  } catch (err) {
    console.error("[/api/phirstmaxx/things/:id PATCH]", err);
    return bad("failed", 500);
  }
}

/**
 * POST { action }:
 *   rerun                          research again, every stage
 *   archive | unarchive
 *   propose { starts_at, ends_at, notes? }   a plan for this thing in that window
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const r = await pmRequest(req, body);
  if (!r.ok) return r.res;
  try {
    const action = String(body.action ?? "");
    if (action === "rerun") {
      const d = await thingDetail(r.supabase, r.ctx, id);
      if (!d.ok) return bad(d.error, d.status);
      await rerunResearch(r.supabase, r.ctx.spaceId, id);
      return NextResponse.json({ ok: true, status: "researching" }, { status: 202 });
    }
    if (action === "archive" || action === "unarchive") return answer(await setThingStatus(r.supabase, r.ctx, id, action === "archive" ? "archived" : "ready"));
    if (action === "propose") {
      if (typeof body.starts_at !== "string" || typeof body.ends_at !== "string") return bad("starts_at and ends_at are instants.");
      const made = await proposePlan(r.supabase, r.ctx, { thing_id: id, starts_at: body.starts_at, ends_at: body.ends_at, kind: "plan", notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : undefined });
      return made.ok ? NextResponse.json({ plan: made.plan }, { status: 201 }) : bad(made.error, made.status);
    }
    return bad("action is rerun, archive, unarchive or propose.");
  } catch (err) {
    console.error("[/api/phirstmaxx/things/:id POST]", err);
    return bad("failed", 500);
  }
}
