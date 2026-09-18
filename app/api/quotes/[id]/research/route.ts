import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { QUOTE_SELECT } from "@/lib/quotes/server";
import { researchQuote } from "@/lib/quotes/research";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** POST — re-run research now (clears wrong / skipped / none). Waits for the result. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const r = await researchQuote(supabase, id, { force: true });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    const { data } = await supabase.from("quotes").select(QUOTE_SELECT).eq("id", id).maybeSingle();
    return NextResponse.json({ quote: data, research: r.research });
  } catch (err) {
    console.error("[/api/quotes/:id/research POST]", err);
    return NextResponse.json({ error: "research failed" }, { status: 500 });
  }
}

/**
 * PATCH { action: "wrong" | "own" | "clear" } — Phil's override (decision 19).
 *  wrong: keep the payload, status = wrong, attributed_to cleared.
 *  own:   verdict = original, attributed_to null, status = none.
 *  clear: back to pending so the sweeper (or a POST) runs it again.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<{ action?: string }>(req);
  const action = body?.action;
  if (action !== "wrong" && action !== "own" && action !== "clear") {
    return NextResponse.json({ error: "action must be wrong | own | clear" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data: cur } = await supabase.from("quotes").select("id, research").eq("id", id).maybeSingle();
    if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
    const research = ((cur as { research: Record<string, unknown> | null }).research ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now };
    if (action === "wrong") {
      update.research_status = "wrong";
      update.attributed_to = null;
      update.research = { ...research, overridden: "wrong", overridden_at: now };
    } else if (action === "own") {
      update.research_status = "none";
      update.attributed_to = null;
      update.research = { ...research, verdict: "original", overridden: "own", overridden_at: now };
    } else {
      update.research_status = "pending";
      update.research = null;
      update.research_ran_at = null;
      update.attributed_to = null;
    }
    const { data, error } = await supabase.from("quotes").update(update).eq("id", id).select(QUOTE_SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ quote: data });
  } catch (err) {
    console.error("[/api/quotes/:id/research PATCH]", err);
    return NextResponse.json({ error: "override failed" }, { status: 500 });
  }
}
