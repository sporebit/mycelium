import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/util/date";
import { parseNotes } from "@/lib/dailyLog";
import { HABITS as DEFAULT_HABITS, type Habit } from "@/lib/config/habits";
import { GOALS_SENTINEL_DATE } from "@/lib/types/goals";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam ?? "90") || 90, 1), 365);

  try {
    const supabase = createServerClient();

    const today = localDateKey();
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    const startStr = start.toISOString().slice(0, 10);

    const [logsRes, configRes] = await Promise.all([
      supabase
        .from("daily_logs")
        .select("log_date, notes")
        .eq("user_id", uid)
        .gte("log_date", startStr)
        .lte("log_date", today)
        .order("log_date", { ascending: true }),
      supabase
        .from("daily_logs")
        .select("notes")
        .eq("user_id", uid)
        .eq("log_date", GOALS_SENTINEL_DATE)
        .maybeSingle(),
    ]);

    let habits: Habit[] = DEFAULT_HABITS;
    if (configRes.data?.notes) {
      const cfg = parseNotes(configRes.data.notes as string) as {
        habits_config?: unknown;
      };
      if (Array.isArray(cfg.habits_config) && cfg.habits_config.length > 0) {
        habits = cfg.habits_config as Habit[];
      }
    }

    const byDate = new Map<string, string[]>();
    for (const row of (logsRes.data ?? []) as { log_date: string; notes: string | null }[]) {
      const notes = parseNotes(row.notes);
      const done = Array.isArray(notes.habits?.done) ? notes.habits!.done! : [];
      byDate.set(row.log_date, done.filter((x): x is string => typeof x === "string"));
    }

    const history: { date: string; completed: string[]; total: number }[] = [];
    const cursor = new Date(startStr);
    const end = new Date(today);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      history.push({
        date: key,
        completed: byDate.get(key) ?? [],
        total: habits.length,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return NextResponse.json({ history, habits });
  } catch (err) {
    console.error("[/api/habits-history]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
