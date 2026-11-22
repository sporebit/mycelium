import { NextRequest, NextResponse } from "next/server";
import { bad, pmRequest } from "@/lib/phirstmaxx/http";
import { listPlans, proposePlan } from "@/lib/phirstmaxx/plans";
import { PLAN_STATUS } from "@/lib/phirstmaxx/types";
import { readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";

/**
 * GET /api/phirstmaxx/plans?status=proposed,accepted&from=&to= — the
 * space's plans with each person's answer and the legs (spec §7).
 */
export async function GET(req: NextRequest) {
  const r = await pmRequest(req);
  if (!r.ok) return r.res;
  try {
    const sp = req.nextUrl.searchParams;
    const status = (sp.get("status") ?? "").split(",").map((s) => s.trim()).filter((s) => (PLAN_STATUS as readonly string[]).includes(s));
    const from = sp.get("from");
    const to = sp.get("to");
    const plans = await listPlans(r.supabase, r.ctx.spaceId, {
      status: status.length ? status : undefined,
      from: from && !Number.isNaN(Date.parse(from)) ? new Date(from).toISOString() : undefined,
      to: to && !Number.isNaN(Date.parse(to)) ? new Date(to).toISOString() : undefined,
    });
    return NextResponse.json({ plans, people: r.ctx.people.map((p) => ({ id: p.id, name: p.name, colour: p.colour })), me: r.ctx.uid });
  } catch (err) {
    console.error("[/api/phirstmaxx/plans GET]", err);
    return bad("fetch failed", 500);
  }
}

/**
 * POST { thing_id?, starts_at, ends_at, title?, kind?, notes? } — propose a
 * plan for a thing in a window, or a hold ({ kind: "hold" }, no thing) that
 * keeps the window free.
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const r = await pmRequest(req, body);
  if (!r.ok) return r.res;
  try {
    if (typeof body.starts_at !== "string" || typeof body.ends_at !== "string" || Number.isNaN(Date.parse(body.starts_at)) || Number.isNaN(Date.parse(body.ends_at))) return bad("starts_at and ends_at are instants.");
    if (Date.parse(body.ends_at) <= Date.parse(body.starts_at)) return bad("A plan ends after it starts.");
    const kind = body.kind === "hold" ? "hold" : "plan";
    const thingId = typeof body.thing_id === "string" && body.thing_id ? body.thing_id : null;
    if (kind === "plan" && !thingId) return bad("A plan needs a thing; a hold does not.");
    const made = await proposePlan(r.supabase, r.ctx, {
      thing_id: kind === "hold" ? null : thingId,
      starts_at: new Date(body.starts_at).toISOString(),
      ends_at: new Date(body.ends_at).toISOString(),
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : undefined,
      kind,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 1000) : undefined,
    });
    return made.ok ? NextResponse.json({ plan: made.plan }, { status: 201 }) : bad(made.error, made.status);
  } catch (err) {
    console.error("[/api/phirstmaxx/plans POST]", err);
    return bad("failed", 500);
  }
}
