import type { SupabaseClient } from "@supabase/supabase-js";

export type DailyNotes = {
  focus?: string;
  todaysOneThing?: string;
  habits?: { done?: string[] };
  [key: string]: unknown;
};

export type DailyLogRow = {
  id: string;
  log_date: string;
  notes: string | null;
  mood: string | null;
};

export function parseNotes(text: string | null | undefined): DailyNotes {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as DailyNotes) : {};
  } catch {
    return {};
  }
}

export async function getOrCreateDailyLog(
  supabase: SupabaseClient,
  userId: string,
  dateKey: string
): Promise<DailyLogRow> {
  const fetchRow = async () =>
    supabase
      .from("daily_logs")
      .select("id, log_date, notes, mood")
      .eq("user_id", userId)
      .eq("log_date", dateKey)
      .maybeSingle();

  const initial = await fetchRow();
  if (initial.error) {
    throw new Error(`daily_logs fetch failed: ${initial.error.message}`);
  }
  if (initial.data) return initial.data as DailyLogRow;

  const insert = await supabase
    .from("daily_logs")
    .insert({ user_id: userId, log_date: dateKey, notes: "{}" })
    .select("id, log_date, notes, mood")
    .single();

  if (insert.data) return insert.data as DailyLogRow;

  // Possibly a race (unique violation). Refetch.
  const retry = await fetchRow();
  if (retry.data) return retry.data as DailyLogRow;
  throw new Error(`daily_logs upsert failed: ${insert.error?.message ?? "unknown"}`);
}
