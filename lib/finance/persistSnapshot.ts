import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateDailyLog, parseNotes } from "@/lib/dailyLog";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import type { FinanceData, FinanceSnapshot, FinanceHistoryPoint } from "./types";

export async function persistSnapshot(
  supabase: SupabaseClient,
  userId: string,
  snapshot: FinanceSnapshot,
  source: "manual" | "cron"
): Promise<FinanceData> {
  const dateKey = localDateKey();
  const row = await getOrCreateDailyLog(supabase, userId, dateKey);
  const current = parseNotes(row.notes) as Record<string, unknown>;

  const finance: FinanceData = {
    snapshot,
    last_refreshed_at: new Date().toISOString(),
    source,
  };

  const merged = { ...current, finance };
  const { error } = await supabase
    .from("daily_logs")
    .update({
      notes: JSON.stringify(merged),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw error;

  return finance;
}

function extractFinance(notesStr: string | null | undefined): FinanceData | null {
  const notes = parseNotes(notesStr) as { finance?: unknown };
  const f = notes.finance;
  if (!f || typeof f !== "object") return null;
  const o = f as Record<string, unknown>;
  if (
    !o.snapshot ||
    typeof o.snapshot !== "object" ||
    typeof o.last_refreshed_at !== "string"
  ) {
    return null;
  }
  return o as unknown as FinanceData;
}

/**
 * Returns the latest finance snapshot — today's row if it has one, otherwise
 * walks back day-by-day until it finds one. Returns null if no row in the
 * past 400 days has a finance snapshot.
 */
export async function getLatestSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<(FinanceData & { date: string }) | null> {
  const today = localDateKey();
  let earliest = today;
  for (let i = 0; i < 400; i++) earliest = previousDateKey(earliest);

  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, notes")
    .eq("user_id", userId)
    .gte("log_date", earliest)
    .lte("log_date", today)
    .order("log_date", { ascending: false });

  if (error) throw error;
  for (const row of (data ?? []) as Array<{ log_date: string; notes: string | null }>) {
    const fin = extractFinance(row.notes);
    if (fin) return { ...fin, date: row.log_date };
  }
  return null;
}

/**
 * Returns all snapshots over the past N months, newest first.
 */
export async function getSnapshotHistory(
  supabase: SupabaseClient,
  userId: string,
  months: number
): Promise<FinanceHistoryPoint[]> {
  const today = localDateKey();
  let earliest = today;
  for (let i = 0; i < months * 31; i++) earliest = previousDateKey(earliest);

  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date, notes")
    .eq("user_id", userId)
    .gte("log_date", earliest)
    .lte("log_date", today)
    .order("log_date", { ascending: false });

  if (error) throw error;

  const out: FinanceHistoryPoint[] = [];
  for (const row of (data ?? []) as Array<{ log_date: string; notes: string | null }>) {
    const fin = extractFinance(row.notes);
    if (fin) {
      out.push({
        date: row.log_date,
        snapshot: fin.snapshot,
        last_refreshed_at: fin.last_refreshed_at,
        source: fin.source,
      });
    }
  }
  return out;
}
