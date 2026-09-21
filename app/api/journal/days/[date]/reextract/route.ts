import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, ticketWriteGate } from "@/lib/tickets/server";
import { getDay, reextract } from "@/lib/daylog/engine";
import { DATE_RE } from "@/lib/daylog/day";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST — re-run extraction on the frozen transcript (spec §5). Bumps
 * extraction_version; only adds scenes and review items that are new, so
 * nothing edited or already reviewed is touched. Closed days only.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ date: string }> }) {
  const { date } = await ctx.params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const day = await getDay(supabase, date);
    if (!day) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (day.status !== "closed") return NextResponse.json({ error: "only a closed day can be re-extracted" }, { status: 409 });
    const r = await reextract(supabase, day.id);
    return NextResponse.json({ day: r.day, scenes_added: r.scenes, queued: r.queued, quotes: r.quotes });
  } catch (err) {
    console.error("[/api/journal/days/:date/reextract POST]", err);
    return NextResponse.json({ error: "re-extract failed" }, { status: 500 });
  }
}
