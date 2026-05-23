import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import { parseNotes } from "@/lib/dailyLog";

export const runtime = "nodejs";

const MAX_LOOKBACK = 400;

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  const today = localDateKey();

  try {
    const supabase = createServerClient();

    // Lower bound for the SQL query
    let earliest = today;
    for (let i = 0; i < MAX_LOOKBACK; i++) earliest = previousDateKey(earliest);

    const { data: rows, error } = await supabase
      .from("daily_logs")
      .select("log_date, notes")
      .eq("user_id", uid)
      .gte("log_date", earliest)
      .lte("log_date", today)
      .order("log_date", { ascending: false });

    if (error) throw error;

    const byDate = new Map<string, string | null>();
    for (const r of (rows ?? []) as Array<{ log_date: string; notes: string | null }>) {
      byDate.set(r.log_date, r.notes);
    }

    let streak = 0;
    let date = today;
    let isFirst = true;
    for (let i = 0; i < MAX_LOOKBACK; i++) {
      const notes = parseNotes(byDate.get(date) ?? null);
      const done = Array.isArray(notes.habits?.done) ? notes.habits!.done!.length : 0;
      if (done >= 1) {
        streak++;
      } else if (isFirst) {
        // grace day — today not yet qualified, don't break the streak
      } else {
        break;
      }
      isFirst = false;
      date = previousDateKey(date);
    }

    return NextResponse.json({ days: streak });
  } catch (err) {
    console.error("[streak GET]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
