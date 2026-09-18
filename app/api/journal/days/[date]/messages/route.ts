import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { ensureDay, runTurn, startQuick, startSkip, startTalk } from "@/lib/daylog/engine";
import { DATE_RE } from "@/lib/daylog/day";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/journal/days/[date]/messages — the app transport (spec §5).
 * { text } appends and runs a turn; { start: "talk" | "quick" | "skip" }
 * opens the day in that mode (the same thing the Telegram buttons do).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ date: string }> }) {
  const { date } = await ctx.params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const uid = await principalUid();
  const body = await readJson<{ text?: string; start?: string }>(req);
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    if (body?.start === "talk" || body?.start === "quick" || body?.start === "skip") {
      const r = body.start === "talk" ? await startTalk(supabase, date, "app") : body.start === "quick" ? await startQuick(supabase, date, "app") : await startSkip(supabase, date, "app");
      return NextResponse.json({ reply: r.reply, state: r.state, missing: r.missing ?? [], day: r.day });
    }
    const text = body?.text?.trim();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    const day = await ensureDay(supabase, date);
    if (day.status === "closed" || day.status === "skipped") return NextResponse.json({ error: `day is ${day.status}` }, { status: 409 });
    const r = await runTurn(supabase, day.id, text, "app");
    return NextResponse.json({ reply: r.reply, state: r.state, missing: r.missing ?? [], day: r.day });
  } catch (err) {
    console.error("[/api/journal/days/:date/messages POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "turn failed" }, { status: 500 });
  }
}
