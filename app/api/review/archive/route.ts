import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseNotes } from "@/lib/dailyLog";
import { isoWeekOf } from "@/lib/util/week";

export const runtime = "nodejs";

type ArchiveEntry = {
  iso_year: number;
  iso_week: number;
  sunday_key: string;
  sealed_at: string;
};

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const supabase = createServerClient();
    // 400 days back covers > 1 year of weekly reviews
    const today = new Date();
    const earliest = new Date(today);
    earliest.setDate(today.getDate() - 400);
    const earliestKey = earliest.toISOString().slice(0, 10);
    const todayKey = today.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("daily_logs")
      .select("log_date, notes")
      .eq("user_id", uid)
      .gte("log_date", earliestKey)
      .lte("log_date", todayKey)
      .order("log_date", { ascending: false });
    if (error) throw error;

    const entries: ArchiveEntry[] = [];
    for (const row of (data ?? []) as Array<{
      log_date: string;
      notes: string | null;
    }>) {
      const notes = parseNotes(row.notes) as { weekly_review?: unknown };
      const r = notes.weekly_review;
      if (!r || typeof r !== "object") continue;
      const sealed = (r as { sealed_at?: unknown }).sealed_at;
      if (typeof sealed !== "string") continue;
      const [y, m, d] = row.log_date.split("-").map(Number);
      const iso = isoWeekOf(new Date(y, m - 1, d));
      entries.push({
        iso_year: iso.year,
        iso_week: iso.week,
        sunday_key: row.log_date,
        sealed_at: sealed,
      });
    }
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("[/api/review/archive GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
