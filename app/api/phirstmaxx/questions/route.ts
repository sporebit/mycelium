import { NextRequest, NextResponse } from "next/server";
import { UUID_RE, bad, pmRequest } from "@/lib/phirstmaxx/http";
import { answerQuestion } from "@/lib/phirstmaxx/research/pipeline";
import { readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/phirstmaxx/questions { drop_id, answer } — the one question
 * research may ask ("What's this place called?"), answered; research
 * carries on from the answer (spec §5).
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const r = await pmRequest(req, body);
  if (!r.ok) return r.res;
  try {
    if (typeof body.drop_id !== "string" || !UUID_RE.test(body.drop_id)) return bad("drop_id is a drop.");
    const text = typeof body.answer === "string" ? body.answer.trim().slice(0, 500) : "";
    if (!text) return bad("An answer is needed.");
    const { data } = await r.supabase.from("pm_drops").select("id").eq("id", body.drop_id).eq("space_id", r.ctx.spaceId).maybeSingle();
    if (!data) return bad("No such drop.", 404);
    const out = await answerQuestion(r.supabase, r.ctx.spaceId, body.drop_id, text);
    return out.ok ? NextResponse.json({ ok: true }, { status: 202 }) : bad(out.error, out.status);
  } catch (err) {
    console.error("[/api/phirstmaxx/questions POST]", err);
    return bad("failed", 500);
  }
}
