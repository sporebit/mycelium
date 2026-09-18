import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, ticketWriteGate } from "@/lib/tickets/server";
import { ensureDay, forceClose } from "@/lib/daylog/engine";
import { DATE_RE } from "@/lib/daylog/day";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST — force close (spec §4.4): an open day goes to its score line; a closing one closes with what it has. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ date: string }> }) {
  const { date } = await ctx.params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const day = await ensureDay(supabase, date);
    const r = await forceClose(supabase, day.id, "app");
    return NextResponse.json({ reply: r.reply, state: r.state, missing: r.missing ?? [], day: r.day });
  } catch (err) {
    console.error("[/api/journal/days/:date/close POST]", err);
    return NextResponse.json({ error: "close failed" }, { status: 500 });
  }
}
