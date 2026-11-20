/**
 * The daily net-worth snapshot: where it is kept and how it is read.
 *
 * Kept in `finance_snapshots` (0172), a finance table: owner-only, never
 * shareable. Until 2026-11-20 it was written into `daily_logs.notes`, which
 * is in the journal section and can be shared; 0172 moved every snapshot
 * out and a trigger on daily_logs keeps the key out. Nothing here reads or
 * writes the daily log.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import type { FinanceData, FinanceSnapshot, FinanceHistoryPoint } from "./types";

type Row = { snapshot_date: string; snapshot: unknown; last_refreshed_at: string; source: string };
const COLUMNS = "snapshot_date, snapshot, last_refreshed_at, source";

function toData(row: Row): (FinanceData & { date: string }) | null {
  if (!row.snapshot || typeof row.snapshot !== "object") return null;
  return {
    snapshot: row.snapshot as FinanceSnapshot,
    last_refreshed_at: new Date(row.last_refreshed_at).toISOString(),
    source: row.source === "cron" ? "cron" : "manual",
    date: row.snapshot_date,
  };
}

/** Today's snapshot, written over any earlier one from today. */
export async function persistSnapshot(
  supabase: SupabaseClient,
  snapshot: FinanceSnapshot,
  source: "manual" | "cron"
): Promise<FinanceData> {
  const finance: FinanceData = {
    snapshot,
    last_refreshed_at: new Date().toISOString(),
    source,
  };
  const { error } = await supabase
    .from("finance_snapshots")
    .upsert(
      { snapshot_date: localDateKey(), snapshot, last_refreshed_at: finance.last_refreshed_at, source },
      { onConflict: "space_id,snapshot_date" }
    );
  if (error) throw error;
  return finance;
}

/**
 * Returns the latest finance snapshot — today's if there is one, otherwise
 * the most recent in the past 400 days. Null if there is none.
 */
export async function getLatestSnapshot(
  supabase: SupabaseClient
): Promise<(FinanceData & { date: string }) | null> {
  const today = localDateKey();
  let earliest = today;
  for (let i = 0; i < 400; i++) earliest = previousDateKey(earliest);

  const { data, error } = await supabase
    .from("finance_snapshots")
    .select(COLUMNS)
    .gte("snapshot_date", earliest)
    .lte("snapshot_date", today)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = ((data ?? []) as Row[])[0];
  return row ? toData(row) : null;
}

/**
 * Returns all snapshots over the past N months, newest first.
 */
export async function getSnapshotHistory(
  supabase: SupabaseClient,
  months: number
): Promise<FinanceHistoryPoint[]> {
  const today = localDateKey();
  let earliest = today;
  for (let i = 0; i < months * 31; i++) earliest = previousDateKey(earliest);

  const { data, error } = await supabase
    .from("finance_snapshots")
    .select(COLUMNS)
    .gte("snapshot_date", earliest)
    .lte("snapshot_date", today)
    .order("snapshot_date", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const out: FinanceHistoryPoint[] = [];
  for (const row of (data ?? []) as Row[]) {
    const fin = toData(row);
    if (fin) out.push({ date: fin.date, snapshot: fin.snapshot, last_refreshed_at: fin.last_refreshed_at, source: fin.source });
  }
  return out;
}
