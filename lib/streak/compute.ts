import type { SupabaseClient } from "@supabase/supabase-js";
import { habitStreak } from "@/lib/habits/store";

/**
 * Consecutive habit-completion days going back from today (today is a
 * grace day). Since the habits fold (0118) this reads ticket_completions;
 * the daily_logs JSON is no longer consulted. `tz` is kept for callers.
 */
export async function computeStreak(supabase: SupabaseClient, _tz?: string): Promise<number> {
  void _tz;
  return habitStreak(supabase);
}
