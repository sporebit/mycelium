import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { DATE_RE, shiftDate, daylogDay } from "@/lib/daylog/day";
import { getDaylogSettings } from "@/lib/daylog/settings";

export const runtime = "nodejs";

/** GET /api/journal/scores?from=&to=&key= — the score series (Health and the weekly review read this). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const today = daylogDay();
  const to = DATE_RE.test(sp.get("to") ?? "") ? sp.get("to")! : today;
  const from = DATE_RE.test(sp.get("from") ?? "") ? sp.get("from")! : shiftDate(to, -30);
  const key = sp.get("key");
  try {
    const supabase = await createUserClient();
    const settings = await getDaylogSettings(supabase);
    const { data, error } = await supabase.from("daylog_days").select("day, scores, status").gte("day", from).lte("day", to).order("day", { ascending: true }).limit(400);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ day: string; scores: Record<string, number>; status: string }>;
    const keys = key ? [key] : settings.scores;
    const series = rows
      .filter((r) => r.scores && Object.keys(r.scores).length)
      .map((r) => ({ day: r.day, ...Object.fromEntries(keys.map((k) => [k, r.scores[k] ?? null])) }));
    return NextResponse.json({ keys, series, window: { from, to } });
  } catch (err) {
    console.error("[/api/journal/scores GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
