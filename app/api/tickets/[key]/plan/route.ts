import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { generateRundown } from "@/lib/tickets/rundown";
import { principalUid, readJson, resolveTicketRef, ticketWriteGate } from "@/lib/tickets/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/tickets/[key]/plan  { body?: string, force?: boolean }
 * "Plan this" (spec §9.1). Life kinds: Sonnet + web search writes
 * rundown_md under the monthly cap. `body` sets the rundown directly — the
 * Claude Code skill's `tix plan KEY --body-file` path for code tickets.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const body = (await readJson<{ body?: string; force?: boolean; model?: string }>(req)) ?? {};
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;

    if (typeof body.body === "string" && body.body.trim()) {
      const ref = await resolveTicketRef(supabase, key);
      if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
      const now = new Date().toISOString();
      await supabase
        .from("tickets")
        .update({ rundown_md: body.body.trim(), rundown_generated_at: now, rundown_model: typeof body.model === "string" ? body.model : "claude-code", updated_at: now })
        .eq("id", ref.id);
      await supabase.from("ticket_activity").insert({ ticket_id: ref.id, action: "rundown", field: "rundown_md", from_value: null, to_value: "written by Claude Code" });
      return NextResponse.json({ ok: true, rundown: body.body.trim() });
    }

    const r = await generateRundown(supabase, key, { force: body.force === true });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, rundown: r.rundown, model: r.model, tokens: { input: r.input, output: r.output }, searches: r.searches });
  } catch (err) {
    console.error("[/api/tickets/:key/plan POST]", err);
    return NextResponse.json({ error: "plan failed" }, { status: 500 });
  }
}
