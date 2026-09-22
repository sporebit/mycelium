import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { weekBlock } from "@/lib/daylog/afterClose";
import { isoWeekOf, mondayKeyOfIsoWeek, parseIsoWeek, sundayKeyOfIsoWeek } from "@/lib/util/week";

export const runtime = "nodejs";

/**
 * GET /api/journal/week?week=2026-W38 — the weekly review block (daylog
 * spec §4.4 step 5): the ISO week's days with their first line and scores,
 * the score averages, how many were logged and skipped. Defaults to this week.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("week");
  const iso = raw ? parseIsoWeek(raw) : isoWeekOf(new Date());
  if (!iso) return NextResponse.json({ error: "bad week" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const monday = mondayKeyOfIsoWeek(iso.year, iso.week);
    const sunday = sundayKeyOfIsoWeek(iso.year, iso.week);
    const block = await weekBlock(supabase, monday, sunday);
    return NextResponse.json({ iso_year: iso.year, iso_week: iso.week, week_start: monday, week_end: sunday, ...block });
  } catch (err) {
    console.error("[/api/journal/week GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
