/**
 * Live context for the fitness and nutrition agents: a short, plain-text
 * block of what is true today, appended to their system prompt on a fresh
 * turn (the same place the day-log diet goes). Da Boi has had its own
 * one-liners since the agents shipped; these are the per-agent versions
 * the backlog deferred.
 *
 * Read-only: nothing here is written into agent_memory. Dates are day
 * keys, not timestamps, so the block is byte-stable within a day unless
 * something is logged (one cache write per change, as with Da Boi).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { activePhaseQuery } from "@/lib/fitness/active-phase";
import { LOG_SELECT } from "@/lib/nutrition/db";
import { sumLogs } from "@/lib/nutrition/calc";
import { getNutritionTargets, type ResolvedNutritionTargets } from "@/lib/nutrition/targets";
import type { NutritionLog } from "@/lib/nutrition/types-v2";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import { isoWeekString, mondayKeyOfIsoWeek, parseIsoWeek } from "@/lib/util/week";

const TZ = () => process.env.USER_TIMEZONE ?? "Europe/London";

function previousNDays(today: string, n: number): string {
  let d = today;
  for (let i = 0; i < n; i++) d = previousDateKey(d);
  return d;
}

/** Programme day_of_week: Monday = 0 … Sunday = 6 (as the today route and headlines use). */
function jsDayToProgrammeDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(toKey) - Date.parse(fromKey)) / 86_400_000);
}

/** "week 3 of 6" for a phase spanning ISO weeks; null when the keys do not parse. */
export function phaseWeekLabel(startWeekIso: string, endWeekIso: string | null, currentWeekIso: string): string | null {
  const start = parseIsoWeek(startWeekIso);
  const cur = parseIsoWeek(currentWeekIso);
  if (!start || !cur) return null;
  const startKey = mondayKeyOfIsoWeek(start.year, start.week);
  const curKey = mondayKeyOfIsoWeek(cur.year, cur.week);
  const n = Math.floor(daysBetween(startKey, curKey) / 7) + 1;
  const end = endWeekIso ? parseIsoWeek(endWeekIso) : null;
  if (!end) return `week ${n}`;
  const total = Math.floor(daysBetween(startKey, mondayKeyOfIsoWeek(end.year, end.week)) / 7) + 1;
  return `week ${n} of ${total}`;
}

// ---------------------------------------------------------------------
// Fitness

export type FitnessLive = {
  today: string;
  programme: { name: string; week: string | null; phase: string } | null;
  plannedToday: Array<{ name: string; slot: string | null; kind: string | null }>;
  recentSessions: Array<{ date: string; name: string; kind: string | null; status: string | null }>;
  recentPain: Array<{ date: string; exercise: string | null; severity: number | null; feel: string | null; regions: string[] }>;
};

export function formatFitnessContext(d: FitnessLive): string {
  const lines: string[] = [`Live fitness context (as of ${d.today}):`];
  lines.push(d.programme ? `- Programme: ${d.programme.name}${d.programme.week ? `, ${d.programme.week}` : ""} (phase ${d.programme.phase}).` : "- Programme: none active this week.");
  lines.push(
    d.plannedToday.length
      ? `- Today's plan: ${d.plannedToday.map((s) => `${s.name}${s.slot || s.kind ? ` (${[s.slot, s.kind].filter(Boolean).join(", ")})` : ""}`).join("; ")}.`
      : "- Today's plan: rest day (nothing scheduled).",
  );
  lines.push(
    d.recentSessions.length
      ? `- Last 7 days: ${d.recentSessions.length} session${d.recentSessions.length === 1 ? "" : "s"} — ${d.recentSessions.map((s) => `${s.date} ${s.name}${s.status ? ` (${s.status})` : ""}`).join("; ")}.`
      : "- Last 7 days: no sessions logged.",
  );
  lines.push(
    d.recentPain.length
      ? `- Pain, last 14 days: ${d.recentPain
          .map((p) => `${p.date} ${p.exercise ?? "unspecified"} — ${p.severity != null ? `${p.severity}/10` : p.feel ?? "logged"}${p.regions.length ? `, ${p.regions.join("/")}` : ""}`)
          .join("; ")}.`
      : "- Pain, last 14 days: none logged.",
  );
  return lines.join("\n");
}

export async function getFitnessContext(supabase: SupabaseClient): Promise<string> {
  const tz = TZ();
  const today = localDateKey(tz);
  const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  const currentWeek = isoWeekString(nowLocal);
  const dow = jsDayToProgrammeDow(nowLocal.getDay());
  const sevenDaysAgo = previousNDays(today, 7);
  const painSince = `${previousNDays(today, 14)}T00:00:00`;

  const [phase, sessions, pain] = await Promise.all([
    activePhaseQuery(supabase, currentWeek),
    supabase.from("workout_sessions").select("date, name, kind, status").gte("date", sevenDaysAgo).lte("date", today).order("date", { ascending: false }).limit(10),
    supabase
      .from("exercise_pain_logs")
      .select("logged_at, exercise_name, severity, feel_rating, pain_regions")
      .is("deleted_at", null)
      .gte("logged_at", painSince)
      .order("logged_at", { ascending: false })
      .limit(8),
  ]);

  let programme: FitnessLive["programme"] = null;
  let plannedToday: FitnessLive["plannedToday"] = [];
  const row = ((phase.data ?? []) as Array<{ programme_id: string; start_week_iso: string; end_week_iso: string | null }>)[0];
  if (row) {
    const [prog, planned] = await Promise.all([
      supabase.from("workout_programmes").select("name").eq("id", row.programme_id).maybeSingle(),
      supabase.from("workout_programme_sessions").select("name, slot, kind").eq("programme_id", row.programme_id).eq("day_of_week", dow).order("slot"),
    ]);
    programme = {
      name: (prog.data as { name: string } | null)?.name ?? "unnamed programme",
      week: phaseWeekLabel(row.start_week_iso, row.end_week_iso, currentWeek),
      phase: `${row.start_week_iso}${row.end_week_iso ? ` → ${row.end_week_iso}` : " →"}`,
    };
    plannedToday = ((planned.data ?? []) as FitnessLive["plannedToday"]).map((s) => ({ name: s.name, slot: s.slot, kind: s.kind }));
  }

  return formatFitnessContext({
    today,
    programme,
    plannedToday,
    recentSessions: (sessions.data ?? []) as FitnessLive["recentSessions"],
    recentPain: ((pain.data ?? []) as Array<{ logged_at: string; exercise_name: string | null; severity: number | null; feel_rating: string | null; pain_regions: string[] | null }>).map((p) => ({
      date: p.logged_at.slice(0, 10),
      exercise: p.exercise_name,
      severity: p.severity,
      feel: p.feel_rating,
      regions: p.pain_regions ?? [],
    })),
  });
}

// ---------------------------------------------------------------------
// Nutrition

export type NutritionLive = {
  today: string;
  targets: Pick<ResolvedNutritionTargets, "kcal" | "protein" | "fat" | "carbs" | "effective_from" | "review_on" | "is_versioned">;
  todayTotals: { kcal: number; protein: number; fat: number; carbs: number; fibre: number; logs: number };
  weekAverage: { kcal: number; protein: number; days: number } | null;
  recentGut: Array<{ date: string; bristol: number | null; discomfort: boolean | null; blood: boolean | null; urgent: boolean | null }>;
  recipes: { count: number; latest: string[] };
};

const g = (n: number) => `${Math.round(n)} g`;

export function formatNutritionContext(d: NutritionLive): string {
  const t = d.targets;
  const lines: string[] = [`Live nutrition context (as of ${d.today}):`];
  lines.push(
    `- Targets: ${Math.round(t.kcal)} kcal, ${g(t.protein)} protein, ${g(t.fat)} fat, ${g(t.carbs)} carbs${
      t.is_versioned ? `${t.effective_from ? ` (set ${t.effective_from}` : " ("}${t.review_on ? `${t.effective_from ? "; " : ""}review ${t.review_on}` : ""})` : " (app defaults — no plan set)"
    }.`,
  );
  const tt = d.todayTotals;
  lines.push(
    tt.logs
      ? `- Today so far: ${Math.round(tt.kcal)} kcal, ${g(tt.protein)} protein, ${g(tt.fat)} fat, ${g(tt.carbs)} carbs, ${g(tt.fibre)} fibre (${tt.logs} log${tt.logs === 1 ? "" : "s"}).`
      : "- Today so far: nothing logged.",
  );
  lines.push(
    d.weekAverage
      ? `- Last 7 days: average ${Math.round(d.weekAverage.kcal)} kcal and ${g(d.weekAverage.protein)} protein over ${d.weekAverage.days} logged day${d.weekAverage.days === 1 ? "" : "s"}.`
      : "- Last 7 days: nothing logged.",
  );
  lines.push(
    d.recentGut.length
      ? `- Gut, last 7 days: ${d.recentGut
          .map((x) => {
            const flags = [x.discomfort ? "discomfort" : null, x.blood ? "blood" : null, x.urgent ? "urgent" : null].filter(Boolean);
            return `${x.date}${x.bristol != null ? ` Bristol ${x.bristol}` : ""}${flags.length ? ` (${flags.join(", ")})` : ""}`;
          })
          .join("; ")}.`
      : "- Gut, last 7 days: none logged.",
  );
  lines.push(d.recipes.count ? `- Recipe library: ${d.recipes.count} recipe${d.recipes.count === 1 ? "" : "s"}${d.recipes.latest.length ? `; latest: ${d.recipes.latest.join(", ")}` : ""}.` : "- Recipe library: empty.");
  return lines.join("\n");
}

export async function getNutritionContext(supabase: SupabaseClient): Promise<string> {
  const today = localDateKey(TZ());
  const sevenDaysAgo = previousNDays(today, 7);
  const gutSince = `${sevenDaysAgo}T00:00:00`;

  const [targets, todayLogs, weekLogs, gut, recipeCount, latestRecipes] = await Promise.all([
    getNutritionTargets(supabase, today),
    supabase.from("nutrition_logs").select(LOG_SELECT).eq("date", today),
    supabase.from("nutrition_logs").select("date, kcal, protein_g").gte("date", sevenDaysAgo).lt("date", today),
    supabase.from("gut_health_logs").select("logged_at, bristol_type, discomfort, blood, urgent").gte("logged_at", gutSince).order("logged_at", { ascending: false }).limit(7),
    supabase.from("recipes").select("id", { count: "exact", head: true }),
    supabase.from("recipes").select("title").order("created_at", { ascending: false }).limit(5),
  ]);

  const todaySum = sumLogs((todayLogs.data ?? []) as unknown as NutritionLog[]);
  const perDay = new Map<string, { kcal: number; protein: number }>();
  for (const l of (weekLogs.data ?? []) as Array<{ date: string; kcal: number | null; protein_g: number | null }>) {
    const cur = perDay.get(l.date) ?? { kcal: 0, protein: 0 };
    cur.kcal += l.kcal ?? 0;
    cur.protein += l.protein_g ?? 0;
    perDay.set(l.date, cur);
  }
  let weekAverage: NutritionLive["weekAverage"] = null;
  if (perDay.size) {
    let kcal = 0;
    let protein = 0;
    for (const v of perDay.values()) {
      kcal += v.kcal;
      protein += v.protein;
    }
    weekAverage = { kcal: kcal / perDay.size, protein: protein / perDay.size, days: perDay.size };
  }

  return formatNutritionContext({
    today,
    targets,
    todayTotals: { kcal: todaySum.kcal, protein: todaySum.protein, fat: todaySum.fat, carbs: todaySum.carbs, fibre: todaySum.fibre, logs: todayLogs.data?.length ?? 0 },
    weekAverage,
    recentGut: ((gut.data ?? []) as Array<{ logged_at: string; bristol_type: number | null; discomfort: boolean | null; blood: boolean | null; urgent: boolean | null }>).map((x) => ({
      date: x.logged_at.slice(0, 10),
      bristol: x.bristol_type,
      discomfort: x.discomfort,
      blood: x.blood,
      urgent: x.urgent,
    })),
    recipes: { count: recipeCount.count ?? 0, latest: ((latestRecipes.data ?? []) as Array<{ title: string }>).map((r) => r.title) },
  });
}

/** The live block for an agent that has one; null for the rest. */
export async function liveContextFor(supabase: SupabaseClient, agentId: string): Promise<string | null> {
  if (agentId === "fitness") return getFitnessContext(supabase);
  if (agentId === "nutrition") return getNutritionContext(supabase);
  return null;
}
