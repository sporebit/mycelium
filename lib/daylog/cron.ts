/**
 * Day log cron tick (spec §4.1). No LLM call here. Every 15 minutes in the
 * evening window: create today's row; send the prompt (with the catch-up
 * buttons for a skipped yesterday) once prompt_time or the snooze is
 * reached; push idle open days (> 2 h) to their score line; at the cutoff
 * mark yesterday's unfinished days skipped. Part D: seeds are gathered at
 * prompt time, stored on the row and quoted in the prompt (spec §4.2); the
 * monthly £ line is checked on every tick (decision 23).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendToPhil } from "@/lib/tickets/notify";
import { currentDay, ensureDay, forceClose, getDay, type DayRow } from "./engine";
import { hmToMinutes, londonClock, shiftDate } from "./day";
import { getDaylogSettings } from "./settings";
import { daylogKeyboard } from "./telegram";
import { gatherSeeds, seedsLine } from "./seeds";
import { monthlyAlert } from "./afterClose";

export type CronReport = { day: string; prompted: boolean; snoozed: boolean; closedIdle: string[]; skipped: string[]; seeds?: string[]; alert?: { spent_pence: number; sent: boolean }; note?: string };

const IDLE_MS = 2 * 60 * 60_000;

export async function daylogTick(db: SupabaseClient, now = new Date()): Promise<CronReport> {
  const s = await getDaylogSettings(db);
  const clock = londonClock(now);
  const day = currentDay(now, s.cutoff);
  const report: CronReport = { day, prompted: false, snoozed: false, closedIdle: [], skipped: [] };
  if (!s.enabled) {
    report.note = "disabled";
    return report;
  }
  try {
    report.alert = await monthlyAlert(db);
  } catch (err) {
    console.error("[daylog] monthly alert failed:", err instanceof Error ? err.message : err);
  }

  // 1. yesterday's leftovers at the cutoff (we are past the cutoff once `day` has rolled over)
  const yday = shiftDate(day, -1);
  const y = await getDay(db, yday);
  if (y && ["pending", "prompted", "open", "closing"].includes(y.status)) {
    const past = clock.minutes >= hmToMinutes(s.cutoff, 180) && clock.date === day; // the new day has begun
    if (past) {
      await db.from("daylog_days").update({ status: "skipped", closed_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", y.id);
      report.skipped.push(yday);
    }
  }

  // 2. idle open days → score line
  const { data: openRows } = await db.from("daylog_days").select("id, day, status, last_activity_at").eq("status", "open").limit(10);
  for (const r of (openRows ?? []) as Array<Pick<DayRow, "id" | "day" | "status" | "last_activity_at">>) {
    const last = r.last_activity_at ? new Date(r.last_activity_at).getTime() : 0;
    if (now.getTime() - last > IDLE_MS) {
      const res = await forceClose(db, r.id, "telegram");
      await sendToPhil(`Still there? Wrapping ${r.day} up.\n${res.reply}`);
      report.closedIdle.push(r.day);
    }
  }

  // 3. tonight's prompt
  const promptAt = hmToMinutes(s.prompt_time, 21 * 60 + 30);
  const inWindow = clock.minutes >= promptAt || clock.minutes < hmToMinutes(s.cutoff, 180);
  if (!inWindow) return report;
  const d = await ensureDay(db, day);
  if (d.status !== "pending") return report;
  if (d.snoozed_until && new Date(d.snoozed_until) > now) {
    report.snoozed = true;
    return report;
  }
  const yd = await getDay(db, yday);
  const catchUp = yd && yd.status === "skipped" && Object.keys(yd.scores ?? {}).length === 0;
  const seeds = await gatherSeeds(db, day, s);
  report.seeds = Object.keys(seeds).filter((k) => k !== "gathered_at");
  const known = seedsLine(seeds);
  const lines = [known ? `Evening. ${known} Talk, Quick or Skip?` : "Evening. How was the day? Talk, Quick or Skip?"];
  if (catchUp) lines.unshift(`Yesterday (${yday}) never got logged — buttons for it are below, then today's.`);
  const ok = await sendToPhil(lines.join("\n"), daylogKeyboard(day));
  if (catchUp) await sendToPhil(`Yesterday, ${yday}:`, daylogKeyboard(yday));
  if (ok) {
    await db.from("daylog_days").update({ status: "prompted", prompted_at: now.toISOString(), snoozed_until: null, seeds, updated_at: now.toISOString() }).eq("id", d.id);
    report.prompted = true;
  } else {
    report.note = "telegram send failed";
  }
  return report;
}
