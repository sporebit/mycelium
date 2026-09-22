/**
 * Day log close, steps 5–6 (spec §4.4) and the two read-side diets:
 *   - the day's summary + approved facts embedded into the memory index so
 *     /api/ask and ⌘K find it (source_type `daylog_day`, one chunk per day,
 *     re-embedded on demand);
 *   - the monthly £ alert from api_usage, sent once per month (decision 23);
 *   - the agent context diet: the last 3 day summaries, ≤ ~300 words, for
 *     the persona agent and Da Boi only (§4.4 step 5, flag 6);
 *   - the weekly review block: the ISO week's days and score averages.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedAndStore } from "@/lib/router/embedAndStore";
import { monthSpendPence } from "@/lib/ai/usage";
import { sendToPhil } from "@/lib/tickets/notify";
import { updateUserSettings } from "@/lib/settings/userSettingsRow";
import { DAY_SELECT, type DayRow } from "./engine";
import { getDaylogSettings } from "./settings";

export const DAYLOG_SOURCE_TYPE = "daylog_day";

/** Summary + facts as one chunk; replaces the day's previous chunk. Soft: never throws. */
export async function embedDay(db: SupabaseClient, day: Pick<DayRow, "id" | "day" | "summary">): Promise<boolean> {
  try {
    const { data: facts } = await db.from("daylog_facts").select("kind, text").eq("day_id", day.id).limit(100);
    const lines = ((facts ?? []) as Array<{ kind: string; text: string }>).map((f) => `${f.kind}: ${f.text}`);
    const text = [`Day log ${day.day}`, day.summary?.trim() ?? "", ...lines].filter(Boolean).join("\n").slice(0, 6000);
    if (text.length < 30) return false;
    await db.from("memory_chunks").delete().eq("source_type", DAYLOG_SOURCE_TYPE).eq("source_id", day.id);
    await embedAndStore({ supabase: db, sourceType: DAYLOG_SOURCE_TYPE, sourceId: day.id, text });
    return true;
  } catch (err) {
    console.error("[daylog] embed failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Monthly alert (decision 23): once the month's day-log spend crosses the
 * setting, one Telegram message. "Once" is kept in user_settings.daylog
 * (`alerted_month`), so no new table.
 */
export async function monthlyAlert(db: SupabaseClient): Promise<{ spent_pence: number; sent: boolean }> {
  const s = await getDaylogSettings(db);
  const spent = await monthSpendPence(db, "daylog:");
  if (!s.monthly_alert_pence || spent < s.monthly_alert_pence) return { spent_pence: spent, sent: false };
  const month = new Date().toISOString().slice(0, 7);
  const { data } = await db.from("user_settings").select("daylog").limit(1).maybeSingle();
  const raw = ((data as { daylog?: Record<string, unknown> | null } | null)?.daylog ?? {}) as Record<string, unknown>;
  if (raw.alerted_month === month) return { spent_pence: spent, sent: false };
  const ok = await sendToPhil(`Day log has cost £${(spent / 100).toFixed(2)} this month — over the £${(s.monthly_alert_pence / 100).toFixed(2)} line. Settings → Journal has the lever.`);
  if (ok) await updateUserSettings(db, { daylog: { ...raw, alerted_month: month } });
  return { spent_pence: spent, sent: ok };
}

/** The last N closed days' summaries, capped at ~300 words in total (flag 6 — read only, never stored on an agent). */
export async function recentDaysContext(db: SupabaseClient, n = 3, maxWords = 300): Promise<string | null> {
  const { data } = await db.from("daylog_days").select("day, summary").eq("status", "closed").not("summary", "is", null).order("day", { ascending: false }).limit(n);
  const rows = (data ?? []) as Array<{ day: string; summary: string }>;
  if (!rows.length) return null;
  const perDay = Math.max(40, Math.floor(maxWords / rows.length));
  const lines = rows.map((r) => {
    const words = r.summary.split("\n")[0].split(/\s+/);
    return `${r.day}: ${words.slice(0, perDay).join(" ")}${words.length > perDay ? "…" : ""}`;
  });
  return `Recent days (from Phil's day log, in his words):\n${lines.join("\n")}`;
}

export type WeekBlock = { days: Array<Pick<DayRow, "day" | "status" | "mode" | "summary" | "scores"> & { first_line: string | null }>; averages: Record<string, number>; logged: number; skipped: number };

/** Days of an ISO week (Monday → Sunday keys) and the mean of each score key over them. */
export async function weekBlock(db: SupabaseClient, mondayKey: string, sundayKey: string): Promise<WeekBlock> {
  const { data } = await db.from("daylog_days").select(DAY_SELECT).gte("day", mondayKey).lte("day", sundayKey).order("day");
  const rows = (data ?? []) as DayRow[];
  const sums = new Map<string, { total: number; n: number }>();
  for (const d of rows) for (const [k, v] of Object.entries(d.scores ?? {})) sums.set(k, { total: (sums.get(k)?.total ?? 0) + v, n: (sums.get(k)?.n ?? 0) + 1 });
  const averages: Record<string, number> = {};
  for (const [k, { total, n }] of sums) averages[k] = Math.round((total / n) * 10) / 10;
  return {
    days: rows.map((d) => ({ day: d.day, status: d.status, mode: d.mode, summary: d.summary, scores: d.scores, first_line: d.summary ? d.summary.split("\n")[0] : null })),
    averages,
    logged: rows.filter((d) => d.status === "closed").length,
    skipped: rows.filter((d) => d.status === "skipped").length,
  };
}
