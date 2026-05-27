import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import { isoWeekString } from "@/lib/util/week";
import { parseNotes } from "@/lib/dailyLog";
import { GOALS_SENTINEL_DATE } from "@/lib/types/goals";
import { HABITS as DEFAULT_HABITS } from "@/lib/config/habits";

export type HeadlineContext = {
  todaysCriticalTaskCount: number;
  workoutsLast7Days: number;
  workoutStreakDays: number;
  workoutsTodayPlanned: number;
  workoutsTodayCompleted: number;
  capturesLast24h: number;
  habitsHitYesterday: number;
  habitsTotalYesterday: number;
  captureCount: number;
};

export type HeadlineCandidate = {
  id: string;
  headline: string;
  body: string;
};

type Rule = {
  id: string;
  condition: (ctx: HeadlineContext) => boolean;
  build: (ctx: HeadlineContext) => { headline: string; body: string };
};

const RULES: Rule[] = [
  {
    id: "critical_blocker",
    condition: (c) => c.todaysCriticalTaskCount >= 1,
    build: () => ({
      headline: "One thing blocks today. Surface it.",
      body: "Voice anything to feed the network.",
    }),
  },
  {
    id: "workout_streak",
    condition: (c) => c.workoutStreakDays >= 5,
    build: (c) => ({
      headline: `${c.workoutStreakDays} days in a row. Network's holding.`,
      body: "Don't break it tonight.",
    }),
  },
  {
    id: "quiet_then_planned",
    condition: (c) =>
      c.workoutsLast7Days === 0 && c.workoutsTodayPlanned >= 1,
    build: () => ({
      headline: "Quiet week. Today has a session.",
      body: "The mat is the network's first node.",
    }),
  },
  {
    id: "heavy_capture",
    condition: (c) => c.capturesLast24h >= 10,
    build: () => ({
      headline: "Heavy capture day. The Compost is full.",
      body: "Review the queue. Decompose what matters.",
    }),
  },
  {
    id: "habits_closed",
    condition: (c) =>
      c.habitsTotalYesterday > 0 &&
      c.habitsHitYesterday === c.habitsTotalYesterday,
    build: () => ({
      headline: "Yesterday's habits closed. Build on it.",
      body: "Voice anything to feed the network.",
    }),
  },
  {
    id: "fresh_canvas",
    condition: (c) => c.captureCount === 0,
    build: () => ({
      headline: "Fresh canvas. Start something.",
      body: "Voice your first capture to seed the network.",
    }),
  },
  {
    id: "default",
    condition: () => true,
    build: () => ({
      headline: "Voice anything. The network listens.",
      body: "Capture, log, decide — all from one box.",
    }),
  },
];

/**
 * Returns every candidate whose rule matches the given context, in
 * declaration order. The `default` rule always matches, so the array
 * is never empty.
 */
export function matchHeadlines(ctx: HeadlineContext): HeadlineCandidate[] {
  return RULES.filter((r) => r.condition(ctx)).map((r) => {
    const { headline, body } = r.build(ctx);
    return { id: r.id, headline, body };
  });
}

const STREAK_LOOKBACK_DAYS = 60;

function previousNDays(today: string, n: number): string {
  let d = today;
  for (let i = 0; i < n; i++) d = previousDateKey(d);
  return d;
}

function jsDayToProgrammeDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export async function buildHeadlineContext(
  supabase: SupabaseClient,
  userId: string
): Promise<HeadlineContext> {
  const tz = process.env.USER_TIMEZONE ?? "Europe/London";
  const today = localDateKey(tz);
  const yesterday = previousDateKey(today);
  const sevenDaysAgo = previousNDays(today, 7);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const nowLocal = new Date(
    new Date().toLocaleString("en-US", { timeZone: tz })
  );
  const currentWeek = isoWeekString(nowLocal);
  const currentDow = jsDayToProgrammeDow(nowLocal.getDay());

  // We fetch a wider workout-date window so we can also walk the streak
  // back to STREAK_THRESHOLD+ days. One query covers both needs.
  const streakLookbackStart = previousNDays(today, STREAK_LOOKBACK_DAYS);

  const [
    criticalTasks,
    workoutRows,
    todayWorkouts,
    capturesRecent,
    yesterdayLog,
    habitsConfigLog,
    captureTotal,
    activePhase,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("urgency", "today")
      .is("completed_at", null),
    supabase
      .from("workout_sessions")
      .select("date")
      .eq("user_id", userId)
      .gte("date", streakLookbackStart)
      .lte("date", today),
    supabase
      .from("workout_sessions")
      .select("id, completed_at")
      .eq("user_id", userId)
      .eq("date", today),
    supabase
      .from("raw_captures")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since24h),
    supabase
      .from("daily_logs")
      .select("notes")
      .eq("user_id", userId)
      .eq("log_date", yesterday)
      .maybeSingle(),
    supabase
      .from("daily_logs")
      .select("notes")
      .eq("user_id", userId)
      .eq("log_date", GOALS_SENTINEL_DATE)
      .maybeSingle(),
    supabase
      .from("raw_captures")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("workout_programme_phases")
      .select("programme_id, start_week_iso, end_week_iso")
      .eq("user_id", userId)
      .lte("start_week_iso", currentWeek)
      .or(`end_week_iso.is.null,end_week_iso.gte.${currentWeek}`)
      .order("start_week_iso", { ascending: false })
      .limit(1),
  ]);

  // Distinct workout dates (last 7 days + full streak window)
  const workoutDates = new Set<string>();
  for (const r of (workoutRows.data ?? []) as Array<{ date: string }>) {
    workoutDates.add(r.date);
  }
  let workoutsLast7Days = 0;
  for (const d of workoutDates) {
    if (d >= sevenDaysAgo && d <= today) workoutsLast7Days++;
  }

  // Streak: walk back from today; today counts as a grace day if absent
  let workoutStreakDays = 0;
  let walk = today;
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    if (workoutDates.has(walk)) {
      workoutStreakDays++;
      walk = previousDateKey(walk);
    } else if (i === 0) {
      walk = previousDateKey(walk);
    } else {
      break;
    }
  }

  // Today's planned vs completed
  const todayRows = (todayWorkouts.data ?? []) as Array<{
    id: string;
    completed_at: string | null;
  }>;
  const workoutsTodayCompleted = todayRows.filter((r) => r.completed_at).length;

  let workoutsTodayPlanned = 0;
  const phaseRows = (activePhase.data ?? []) as Array<{
    programme_id: string;
  }>;
  if (phaseRows.length > 0) {
    const { count } = await supabase
      .from("workout_programme_sessions")
      .select("id", { count: "exact", head: true })
      .eq("programme_id", phaseRows[0].programme_id)
      .eq("day_of_week", currentDow);
    workoutsTodayPlanned = count ?? 0;
  }

  // Habits — done set on yesterday's log, total from sentinel config
  const yesterdayNotes = parseNotes(
    (yesterdayLog.data as { notes: string | null } | null)?.notes ?? null
  );
  const habitsHitYesterday = Array.isArray(yesterdayNotes.habits?.done)
    ? yesterdayNotes.habits!.done!.length
    : 0;

  const configNotes = parseNotes(
    (habitsConfigLog.data as { notes: string | null } | null)?.notes ?? null
  ) as { habits_config?: unknown };
  const habitsTotalYesterday = Array.isArray(configNotes.habits_config)
    ? configNotes.habits_config.length
    : DEFAULT_HABITS.length;

  return {
    todaysCriticalTaskCount: criticalTasks.count ?? 0,
    workoutsLast7Days,
    workoutStreakDays,
    workoutsTodayPlanned,
    workoutsTodayCompleted,
    capturesLast24h: capturesRecent.count ?? 0,
    habitsHitYesterday,
    habitsTotalYesterday,
    captureCount: captureTotal.count ?? 0,
  };
}
