import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isoWeekString } from "@/lib/util/week";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function jsDayToProgrammeDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** Monday-of-week (UTC) for the given YYYY-MM-DD. */
function mondayOf(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = jsDayToProgrammeDow(dt.getUTCDay());
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/fitness/week-summary?anchor=YYYY-MM-DD
 *
 * Returns the seven days of the week containing the anchor date, each
 * with a `planned_count` (programme sessions for that day-of-week
 * in the active phase) and a `logged_count` (rows in workout_sessions
 * for that exact date). Drives the day-swap dropdown's dot markers.
 *
 * Anchor defaults to today.
 */
export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  try {
    const supabase = createServerClient();
    const tz = process.env.USER_TIMEZONE ?? "Europe/London";
    const anchorParam = req.nextUrl.searchParams.get("anchor");
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz })
      .format(new Date());
    const anchor =
      anchorParam && /^\d{4}-\d{2}-\d{2}$/.test(anchorParam)
        ? anchorParam
        : todayKey;
    const monday = mondayOf(anchor);
    const weekDays: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      weekDays.push(ymd(d));
    }
    const weekIso = isoWeekString(monday);

    // Active phase for that week. May be null on rest blocks.
    const { data: phaseRows } = await supabase
      .from("workout_programme_phases")
      .select("programme_id, start_week_iso, end_week_iso")
      .eq("user_id", uid)
      .lte("start_week_iso", weekIso)
      .or(`end_week_iso.is.null,end_week_iso.gte.${weekIso}`)
      .order("start_week_iso", { ascending: false })
      .limit(1);
    const phase = (phaseRows ?? [])[0] as
      | { programme_id: string }
      | undefined;

    // Planned-session count per dow.
    const plannedByDow = new Map<number, number>([
      [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
    ]);
    if (phase) {
      const { data: tplRows } = await supabase
        .from("workout_programme_sessions")
        .select("day_of_week")
        .eq("programme_id", phase.programme_id);
      for (const r of (tplRows ?? []) as Array<{ day_of_week: number }>) {
        plannedByDow.set(r.day_of_week, (plannedByDow.get(r.day_of_week) ?? 0) + 1);
      }
    }

    // Logged-session count per date in the week.
    const { data: liveRows } = await supabase
      .from("workout_sessions")
      .select("date")
      .eq("user_id", uid)
      .gte("date", weekDays[0])
      .lte("date", weekDays[6]);
    const loggedByDate = new Map<string, number>();
    for (const r of (liveRows ?? []) as Array<{ date: string }>) {
      loggedByDate.set(r.date, (loggedByDate.get(r.date) ?? 0) + 1);
    }

    const days = weekDays.map((date, i) => ({
      date,
      day_of_week: i, // Mon=0..Sun=6 to match programme dow
      planned_count: plannedByDow.get(i) ?? 0,
      logged_count: loggedByDate.get(date) ?? 0,
      is_today: date === todayKey,
    }));
    return NextResponse.json({
      anchor,
      today: todayKey,
      week_iso: weekIso,
      days,
    });
  } catch (err) {
    console.error("[/api/fitness/week-summary]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
