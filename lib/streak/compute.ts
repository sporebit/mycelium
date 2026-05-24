import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import { parseNotes } from "@/lib/dailyLog";

const MAX_LOOKBACK = 400;

/**
 * Counts consecutive habit-completion days going back from today.
 * Today is allowed as a grace day (not breaking the streak if 0 done yet);
 * any prior day with 0 done breaks the chain.
 */
export async function computeStreak(
  supabase: SupabaseClient,
  userId: string,
  tz?: string
): Promise<number> {
  const today = localDateKey(tz);

  let earliest = today;
  for (let i = 0; i < MAX_LOOKBACK; i++) earliest = previousDateKey(earliest);

  const { data: rows, error } = await supabase
    .from("daily_logs")
    .select("log_date, notes")
    .eq("user_id", userId)
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
    const done = Array.isArray(notes.habits?.done)
      ? notes.habits!.done!.length
      : 0;
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

  return streak;
}
