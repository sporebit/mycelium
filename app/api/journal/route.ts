import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import {
  JOURNAL_SELECT,
  type JournalEntry,
  type JournalGroup,
} from "@/lib/journal/types";

export const runtime = "nodejs";

function defaultFrom(days: number): string {
  let d = localDateKey();
  for (let i = 0; i < days; i++) d = previousDateKey(d);
  return d;
}

export async function GET(req: NextRequest) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? defaultFrom(30);
  const to = url.searchParams.get("to") ?? localDateKey();
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    500,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "200", 10) || 200)
  );

  try {
    const supabase = createServerClient();
    let query = supabase
      .from("journal_entries")
      .select(JOURNAL_SELECT)
      .eq("user_id", uid)
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (q) {
      // ilike on raw_text — coarse but sufficient for v1. The Stroma tab does
      // proper semantic search via embeddings.
      query = query.ilike("raw_text", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const entries = (data ?? []) as JournalEntry[];

    // Fetch daily summaries for the same window.
    const { data: summaries } = await supabase
      .from("journal_daily_summaries")
      .select("entry_date, summary")
      .eq("user_id", uid)
      .gte("entry_date", from)
      .lte("entry_date", to);
    const summaryByDate = new Map<string, string>();
    for (const s of (summaries ?? []) as Array<{
      entry_date: string;
      summary: string;
    }>) {
      summaryByDate.set(s.entry_date, s.summary);
    }

    // Group by date (newest first; entries within a date stay chronological).
    const groupsMap = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      const list = groupsMap.get(e.entry_date) ?? [];
      list.push(e);
      groupsMap.set(e.entry_date, list);
    }
    const groups: JournalGroup[] = [...groupsMap.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, ents]) => ({
        date,
        entries: ents,
        summary: summaryByDate.get(date) ?? null,
      }));

    // Cheap stats for the page header
    const distinctDays = groupsMap.size;

    return NextResponse.json({
      groups,
      stats: { entry_count: entries.length, days_written: distinctDays },
      window: { from, to },
    });
  } catch (err) {
    console.error("[/api/journal GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
