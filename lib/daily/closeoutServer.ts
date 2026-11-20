/**
 * The weekly close-out, read and written for one person (0174). The rules
 * are in closeout.ts and measures.ts; this file asks the database.
 *
 * `db` acts as the person (a request client or one from withUser()).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURES, type FeatureState, goneQuiet } from "@/lib/dormant/features";
import { featureStatesFor } from "@/lib/dormant/server";
import { todayLondon } from "@/lib/tickets/when";
import { boxLeft, type FillPlan, firstWeekOfMonth, lifetimeTotals, type LifetimeTotals, monthOfWeek, previousMonth, weekFill, type WeekFill, weekKey } from "./closeout";
import { type CloseoutCard, loadCloseoutCards } from "./closeoutCards";
import { SOURCES } from "./closeoutSources";
import { finishLineFor } from "./finishServer";
import { type MeasureCloseout, type MeasureInterruption, type MeasurePlan, measureRows, type MonthMeasures, monthMeasures } from "./measures";
import { CLOSEOUT_MINUTES, dailySettings } from "./settings";

export type SectionDecision = "keep" | "pause" | "retire";

export type CloseoutRow = {
  id: string;
  week: string;
  started_at: string | null;
  finished_at: string | null;
  plan: string | null;
  report: string | null;
  fill: WeekFill | null;
  lifetime: LifetimeTotals | null;
  section_key: string | null;
  section_decision: SectionDecision | null;
  section_why: string | null;
  screen_minutes: number | null;
  partner_answers: { helping?: string; costing?: string } | null;
  measures: MonthMeasures | null;
};

const ROW_SELECT = "id, week, started_at, finished_at, plan, report, fill, lifetime, section_key, section_decision, section_why, screen_minutes, partner_answers, measures";

export type CloseoutView = {
  week: string;
  row: CloseoutRow;
  /** Minutes left of the box; null before it starts; 0 when over. */
  box_left: number | null;
  box_minutes: number;
  fill: WeekFill;
  lifetime: LifetimeTotals;
  /** The one quiet section raised this week, or null when nothing is quiet (or everything quiet has been answered). */
  section: { key: string; label: string; href: string; how_long: string; question: string } | null;
  /** The month before this one, measured, when this is the first close-out of a month (or was, and the measures are kept). */
  measures: { current: MonthMeasures; previous: MonthMeasures | null; rows: ReturnType<typeof measureRows> } | null;
  cards: CloseoutCard[];
  slot: { day: number; time: string };
};

/** A pause holds for four weeks; a retirement holds until the feature is used again. */
export const PAUSE_DAYS = 28;

export function currentWeek(now: Date = new Date()): string {
  return weekKey(todayLondon(now));
}

type PlanRow = { day: string; status: string; proposed_at: string | null; prompted_at: string | null; accepted_at: string | null; day_plan_items: Array<{ is_win: boolean; state: string; started_at: string | null; finished_at: string | null }> | null };

async function loadPlans(db: SupabaseClient, uid: string, from?: string, to?: string): Promise<MeasurePlan[]> {
  let q = db.from("day_plans").select("day, status, proposed_at, prompted_at, accepted_at, day_plan_items(is_win, state, started_at, finished_at)").eq("created_by", uid).order("day", { ascending: true }).limit(2000);
  if (from) q = q.gte("day", from);
  if (to) q = q.lte("day", to);
  const { data, error } = await q;
  if (error) throw new Error(`plans: ${error.message}`);
  return ((data ?? []) as PlanRow[]).map((p) => ({ day: p.day, status: p.status, proposed_at: p.proposed_at, prompted_at: p.prompted_at, accepted_at: p.accepted_at, items: p.day_plan_items ?? [] }));
}

export async function ensureCloseout(db: SupabaseClient, uid: string, week: string): Promise<CloseoutRow> {
  const { data } = await db.from("weekly_closeouts").select(ROW_SELECT).eq("created_by", uid).eq("week", week).maybeSingle();
  if (data) return data as CloseoutRow;
  const { data: made, error } = await db.from("weekly_closeouts").insert({ week }).select(ROW_SELECT).single();
  if (error || !made) {
    // Two requests at once: the other one made it.
    const { data: again } = await db.from("weekly_closeouts").select(ROW_SELECT).eq("created_by", uid).eq("week", week).maybeSingle();
    if (again) return again as CloseoutRow;
    throw new Error(`closeout: ${error?.message ?? "insert failed"}`);
  }
  return made as CloseoutRow;
}

/**
 * The quiet features still worth raising: not retired, and not paused in
 * the last four weeks. Decisions are read from the close-out rows.
 */
export async function sectionToRaise(db: SupabaseClient, uid: string, states: readonly FeatureState[], now: Date = new Date()): Promise<FeatureState | null> {
  const since = new Date(now.getTime() - PAUSE_DAYS * 86_400_000).toISOString();
  const { data } = await db.from("weekly_closeouts").select("section_key, section_decision, finished_at, created_at").eq("created_by", uid).not("section_decision", "is", null).order("created_at", { ascending: false }).limit(100);
  const settled = new Set<string>();
  for (const r of (data ?? []) as Array<{ section_key: string | null; section_decision: SectionDecision | null; finished_at: string | null; created_at: string }>) {
    if (!r.section_key) continue;
    const at = r.finished_at ?? r.created_at;
    const feature = FEATURES.find((f) => f.key === r.section_key);
    const state = states.find((s) => s.key === r.section_key);
    // A retired feature that has since been used is back in the running.
    if (r.section_decision === "retire" && !(state?.last_at && feature && state.last_at > at)) settled.add(r.section_key);
    if (r.section_decision === "pause" && at >= since) settled.add(r.section_key);
  }
  return goneQuiet(states).find((s) => !settled.has(s.key)) ?? null;
}

export async function closeoutView(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<CloseoutView> {
  const week = currentWeek(now);
  const settings = await dailySettings(db);
  const [row, plans, closedCount] = await Promise.all([
    ensureCloseout(db, uid, week),
    loadPlans(db, uid),
    db.from("weekly_closeouts").select("id", { count: "exact", head: true }).eq("created_by", uid).not("finished_at", "is", null),
  ]);
  const fillPlans: FillPlan[] = plans;
  const fill = row.fill ?? weekFill(week, fillPlans);
  const lifetime = row.lifetime ?? lifetimeTotals(fillPlans, closedCount.count ?? 0);

  let section: CloseoutView["section"] = null;
  if (row.section_key) {
    const f = FEATURES.find((x) => x.key === row.section_key);
    if (f) section = { key: f.key, label: f.label, href: f.href, how_long: "", question: `${f.label}: ${row.section_decision ?? "undecided"}.` };
  } else {
    try {
      const states = await featureStatesFor(db, now);
      const top = await sectionToRaise(db, uid, states, now);
      if (top) {
        section = { key: top.key, label: top.label, href: top.href, how_long: top.how_long ?? "", question: `${top.label} has not been touched for ${top.how_long}. Why? Keep it, pause it, or retire it.` };
      }
    } catch (err) {
      console.error("[closeout] dormant:", err instanceof Error ? err.message : err);
    }
  }

  let measures: CloseoutView["measures"] = null;
  if (row.measures) {
    const previous = await previousMeasures(db, uid, row.measures.month);
    measures = { current: row.measures, previous, rows: measureRows(row.measures, previous) };
  } else if (firstWeekOfMonth(week)) {
    const month = previousMonth(monthOfWeek(week));
    const current = await computeMeasures(db, uid, month, plans, now);
    const previous = await previousMeasures(db, uid, month);
    measures = { current, previous, rows: measureRows(current, previous) };
  }

  const cards = row.finished_at ? [] : await loadCloseoutCards(SOURCES, db, uid, week);

  return {
    week,
    row,
    box_left: boxLeft(row.started_at, CLOSEOUT_MINUTES, now),
    box_minutes: CLOSEOUT_MINUTES,
    fill,
    lifetime,
    section,
    measures,
    cards,
    slot: { day: settings.closeout_day, time: settings.closeout_time },
  };
}

/** The measures kept on an earlier close-out for the month before `month`, if any. */
async function previousMeasures(db: SupabaseClient, uid: string, month: string): Promise<MonthMeasures | null> {
  const before = previousMonth(month);
  const { data } = await db.from("weekly_closeouts").select("measures").eq("created_by", uid).eq("measures->>month", before).limit(1).maybeSingle();
  return ((data as { measures: MonthMeasures | null } | null)?.measures as MonthMeasures | undefined) ?? null;
}

export async function computeMeasures(db: SupabaseClient, uid: string, month: string, plans?: MeasurePlan[], now: Date = new Date()): Promise<MonthMeasures> {
  const monthPlans = plans ? plans.filter((p) => p.day.startsWith(month)) : await loadPlans(db, uid, `${month}-01`, `${month}-31`);
  const [inter, closeouts, line] = await Promise.all([
    db.from("interruptions").select("at, acted_at, origin, counted").eq("created_by", uid).gte("at", `${month}-01T00:00:00Z`).lt("at", `${nextMonth(month)}-01T00:00:00Z`).limit(2000),
    db.from("weekly_closeouts").select("week, screen_minutes, partner_answers").eq("created_by", uid).not("finished_at", "is", null).limit(500),
    finishLineFor(db, uid, now).catch(() => []),
  ]);
  const closeoutsInMonth = ((closeouts.data ?? []) as MeasureCloseout[]).filter((c) => monthOfWeek(c.week) === month);
  return monthMeasures(month, {
    plans: monthPlans,
    interruptions: (inter.data ?? []) as MeasureInterruption[],
    closeouts: closeoutsInMonth,
    stuck: line.filter((i) => i.idle_days >= 14).length,
  });
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export async function startCloseout(db: SupabaseClient, uid: string, week: string, plan: string, now: Date = new Date()): Promise<CloseoutRow> {
  const row = await ensureCloseout(db, uid, week);
  if (row.started_at) return row;
  const { data, error } = await db.from("weekly_closeouts").update({ started_at: now.toISOString(), plan: plan.slice(0, 500), updated_at: now.toISOString() }).eq("id", row.id).select(ROW_SELECT).single();
  if (error || !data) throw new Error(`closeout start: ${error?.message ?? "update failed"}`);
  return data as CloseoutRow;
}

export async function decideSection(db: SupabaseClient, uid: string, week: string, key: string, decision: SectionDecision, why: string, now: Date = new Date()): Promise<CloseoutRow> {
  if (!FEATURES.some((f) => f.key === key)) throw new Error("unknown section");
  const row = await ensureCloseout(db, uid, week);
  const { data, error } = await db.from("weekly_closeouts").update({ section_key: key, section_decision: decision, section_why: why.slice(0, 1000) || null, updated_at: now.toISOString() }).eq("id", row.id).select(ROW_SELECT).single();
  if (error || !data) throw new Error(`closeout section: ${error?.message ?? "update failed"}`);
  return data as CloseoutRow;
}

export type FinishInput = { report: string; screen_minutes?: number | null; partner_answers?: { helping?: string; costing?: string } | null };

/** Close the week: the report, the fill and totals as they stand, and the month's measures if this is the month's first. Always works. */
export async function finishCloseout(db: SupabaseClient, uid: string, week: string, input: FinishInput, now: Date = new Date()): Promise<CloseoutRow> {
  const row = await ensureCloseout(db, uid, week);
  if (row.finished_at) return row;
  const [plans, closedCount] = await Promise.all([loadPlans(db, uid), db.from("weekly_closeouts").select("id", { count: "exact", head: true }).eq("created_by", uid).not("finished_at", "is", null)]);
  const fill = weekFill(week, plans);
  const lifetime = lifetimeTotals(plans, (closedCount.count ?? 0) + 1);
  const measures = row.measures ?? (firstWeekOfMonth(week) ? await computeMeasures(db, uid, previousMonth(monthOfWeek(week)), plans, now).catch(() => null) : null);
  const patch: Record<string, unknown> = {
    finished_at: now.toISOString(),
    started_at: row.started_at ?? now.toISOString(),
    report: input.report.slice(0, 1000) || null,
    fill,
    lifetime,
    measures,
    updated_at: now.toISOString(),
  };
  if (typeof input.screen_minutes === "number" && input.screen_minutes >= 0 && input.screen_minutes <= 10080) patch.screen_minutes = Math.round(input.screen_minutes);
  if (input.partner_answers && (input.partner_answers.helping || input.partner_answers.costing)) {
    patch.partner_answers = { helping: input.partner_answers.helping?.slice(0, 500), costing: input.partner_answers.costing?.slice(0, 500) };
  }
  const { data, error } = await db.from("weekly_closeouts").update(patch).eq("id", row.id).select(ROW_SELECT).single();
  if (error || !data) throw new Error(`closeout finish: ${error?.message ?? "update failed"}`);
  return data as CloseoutRow;
}

/** Every month that has measures, newest first, for the measures page. */
export async function measuresHistory(db: SupabaseClient, uid: string): Promise<MonthMeasures[]> {
  const { data } = await db.from("weekly_closeouts").select("measures").eq("created_by", uid).not("measures", "is", null).order("week", { ascending: false }).limit(36);
  return ((data ?? []) as Array<{ measures: MonthMeasures }>).map((r) => r.measures);
}
