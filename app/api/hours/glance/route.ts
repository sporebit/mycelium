import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { localDateKey } from "@/lib/util/date";
import { bannerText, buildIndex, fmtHm, mondayOf, todayPanel, weekSummary, weekdayIndex } from "@/lib/hours/calc";
import { ABSENCE_SELECT, ENTRY_SELECT, HOLIDAY_SELECT, SETTINGS_SELECT, type HoursBundle } from "@/lib/hours/types";

export const runtime = "nodejs";

export type HoursGlance =
  | { show: false; reason: string }
  | { show: true; banner: string; pill: string; banked: string; remaining: string; leftToday: string; todayTotal: string; met: boolean };

/**
 * GET /api/hours/glance — the Today tile (O4: Mon–Thu only). A small answer
 * for the home surface: whether to show, the banner, the Today pill and the
 * figures behind them. `show` is false outside Mon–Thu and for anyone whose
 * space has no tracker (no settings row and no entries this week).
 */
export async function GET() {
  try {
    const today = localDateKey();
    if (weekdayIndex(today) > 3) return NextResponse.json({ show: false, reason: "weekend" } satisfies HoursGlance);
    const supabase = await createUserClient();
    const monday = mondayOf(today);
    const [settings, entries, absences, holidays] = await Promise.all([
      supabase.from("hours_settings").select(SETTINGS_SELECT).maybeSingle(),
      supabase.from("hours_entries").select(ENTRY_SELECT).is("deleted_at", null).gte("entry_date", monday),
      supabase.from("hours_absences").select(ABSENCE_SELECT).gte("absence_date", monday),
      supabase.from("hours_bank_holidays").select(HOLIDAY_SELECT).gte("holiday_date", monday),
    ]);
    for (const r of [settings, entries, absences, holidays]) if (r.error) throw r.error;
    if (!settings.data && (entries.data ?? []).length === 0) return NextResponse.json({ show: false, reason: "no tracker" } satisfies HoursGlance);
    const bundle: HoursBundle = {
      settings: (settings.data as HoursBundle["settings"]) ?? null,
      entries: (entries.data ?? []) as unknown as HoursBundle["entries"],
      absences: (absences.data ?? []) as unknown as HoursBundle["absences"],
      bankHolidays: (holidays.data ?? []) as unknown as HoursBundle["bankHolidays"],
    };
    const index = buildIndex(bundle, today);
    const ws = weekSummary(index, monday, today);
    const tp = todayPanel(index, ws, today);
    const out: HoursGlance = {
      show: true,
      banner: bannerText(ws),
      pill: tp.pill,
      banked: fmtHm(ws.banked),
      remaining: fmtHm(ws.remaining),
      leftToday: fmtHm(tp.leftToday),
      todayTotal: fmtHm(tp.todayTotal),
      met: ws.banked >= ws.target,
    };
    return NextResponse.json(out);
  } catch (err) {
    console.error("[/api/hours/glance GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
