import { NextRequest, NextResponse } from "next/server";
import { UUID_RE, bad, pmRequest } from "@/lib/phirstmaxx/http";
import { cancelPlan, markDone, respondToPlan } from "@/lib/phirstmaxx/plans";
import { readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };
const ANSWERS = ["yes", "no", "another_time"] as const;

/**
 * POST /api/phirstmaxx/plans/<id> { action }:
 *   respond { answer: yes | no | another_time }   both yes → accepted → on the Family calendar → both told
 *   cancel
 *   done { note? }                                 afterwards; the note goes to the family timeline
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("No such plan.", 404);
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const r = await pmRequest(req, body);
  if (!r.ok) return r.res;
  try {
    const action = String(body.action ?? "");
    if (action === "respond") {
      if (!(ANSWERS as readonly unknown[]).includes(body.answer)) return bad("answer is yes, no or another_time.");
      const out = await respondToPlan(r.supabase, r.ctx, id, body.answer as (typeof ANSWERS)[number]);
      return out.ok ? NextResponse.json({ plan: out.plan }) : bad(out.error, out.status);
    }
    if (action === "cancel") {
      const out = await cancelPlan(r.supabase, r.ctx, id);
      return out.ok ? NextResponse.json({ plan: out.plan }) : bad(out.error, out.status);
    }
    if (action === "done") {
      const out = await markDone(r.supabase, r.ctx, id, typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : undefined);
      return out.ok ? NextResponse.json({ plan: out.plan }) : bad(out.error, out.status);
    }
    return bad("action is respond, cancel or done.");
  } catch (err) {
    console.error("[/api/phirstmaxx/plans/:id POST]", err);
    return bad("failed", 500);
  }
}
