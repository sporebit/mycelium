import { createServerClient } from "@/lib/supabase/server";
import { previousDateKey } from "@/lib/util/date";
import { parseNotes } from "@/lib/dailyLog";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { isBlocker, sortBlockers, toBlockerRow } from "@/lib/blockers";
import type { BlockerRow } from "@/lib/blockers";
import type { Task } from "@/lib/types/task";
import { computeStreak } from "@/lib/streak/compute";
import { getCalendarData, type CalendarEvent } from "@/lib/calendar/fetch";
import {
  getLatestSnapshot,
  getSnapshotHistory,
} from "@/lib/finance/persistSnapshot";
import { fetchWeather, type Weather } from "./weather";
import { fetchPendingReviewCount } from "@/lib/captures/reviewCount";
import type { FinanceData } from "@/lib/finance/types";

export type BriefingData = {
  dateKey: string;
  calendar: CalendarEvent[];
  topTasks: Task[];
  blockers: BlockerRow[];
  habits: { done: number; total: number };
  streak: number;
  finance: {
    current: FinanceData;
    delta: number | null;
    pct: number | null;
  } | null;
  weather: Weather | null;
  /** Captures awaiting triage at briefing time. Surfaced in the footer
   *  when > 0; suppressed otherwise so the daily summary stays quiet. */
  reviewCount: number;
};

function startOfTodayLocal(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  // dateKey is in user's local tz; use UTC bounds liberally so we catch
  // events that started yesterday and end today, etc.
  return new Date(Date.UTC(y, m - 1, d));
}

function endOfTodayLocal(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) - 1);
}

function todayEventsFromCal(
  events: CalendarEvent[],
  dateKey: string
): CalendarEvent[] {
  // dateKey is the local date. An event belongs to "today" if its start
  // (rendered as a local date) matches dateKey.
  const out: CalendarEvent[] = [];
  for (const e of events) {
    const start = new Date(e.start);
    const localKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
    }).format(start);
    if (localKey === dateKey) out.push(e);
  }
  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

async function fetchTopTasks(userId: string): Promise<Task[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("user_id", userId)
    .eq("urgency", "today")
    .eq("key", true)
    .is("completed_at", null)
    .order("priority_score", { ascending: false, nullsFirst: false })
    .limit(3);
  if (error) {
    console.error("[briefing] top tasks fetch failed:", error);
    return [];
  }
  return (data ?? []).map((row) =>
    serializeTask(row as Parameters<typeof serializeTask>[0])
  );
}

async function fetchTopBlockers(
  userId: string,
  dateKey: string
): Promise<BlockerRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("user_id", userId)
    .is("completed_at", null);
  if (error) {
    console.error("[briefing] blockers fetch failed:", error);
    return [];
  }
  const tasks = (data ?? []).map((row) =>
    serializeTask(row as Parameters<typeof serializeTask>[0])
  );
  const matching = tasks.filter((t) => isBlocker(t, dateKey));
  const rows = sortBlockers(
    matching.map((t) => toBlockerRow(t, dateKey, "Europe/London"))
  );
  return rows.slice(0, 3);
}

async function fetchYesterdayHabits(
  userId: string,
  yesterdayKey: string
): Promise<{ done: number; total: number }> {
  const supabase = createServerClient();

  // Yesterday's row → done count
  const [yesterdayRow, sentinelRow] = await Promise.all([
    supabase
      .from("daily_logs")
      .select("notes")
      .eq("user_id", userId)
      .eq("log_date", yesterdayKey)
      .maybeSingle(),
    supabase
      .from("daily_logs")
      .select("notes")
      .eq("user_id", userId)
      .eq("log_date", "2000-01-01")
      .maybeSingle(),
  ]);

  const yNotes = parseNotes(yesterdayRow.data?.notes ?? null);
  const sNotes = parseNotes(sentinelRow.data?.notes ?? null) as {
    habits_config?: unknown;
  };

  const done = Array.isArray(yNotes.habits?.done)
    ? yNotes.habits!.done!.length
    : 0;
  const total = Array.isArray(sNotes.habits_config)
    ? sNotes.habits_config.length
    : 6;

  return { done, total };
}

async function fetchFinanceWithDelta(
  userId: string,
  dateKey: string
): Promise<BriefingData["finance"]> {
  const supabase = createServerClient();
  const latest = await getLatestSnapshot(supabase, userId);
  if (!latest) return null;

  // Pull a short history to find yesterday (or closest prior).
  const history = await getSnapshotHistory(supabase, userId, 2);
  const yesterdayKey = previousDateKey(dateKey);
  const prior = history.find((p) => p.date <= yesterdayKey) ?? null;

  let delta: number | null = null;
  let pct: number | null = null;
  if (prior) {
    delta = latest.snapshot.net_worth - prior.snapshot.net_worth;
    if (prior.snapshot.net_worth !== 0) {
      pct = (delta / Math.abs(prior.snapshot.net_worth)) * 100;
    }
  }

  return {
    current: {
      snapshot: latest.snapshot,
      last_refreshed_at: latest.last_refreshed_at,
      source: latest.source,
    },
    delta,
    pct,
  };
}

export async function gatherBriefingData(
  userId: string,
  dateKey: string
): Promise<BriefingData> {
  const yesterdayKey = previousDateKey(dateKey);

  const [
    calendarRes,
    topTasks,
    blockers,
    habits,
    streakDays,
    finance,
    weather,
    reviewCount,
  ] = await Promise.allSettled([
    getCalendarData(),
    fetchTopTasks(userId),
    fetchTopBlockers(userId, dateKey),
    fetchYesterdayHabits(userId, yesterdayKey),
    computeStreak(createServerClient(), userId, "Europe/London"),
    fetchFinanceWithDelta(userId, dateKey),
    fetchWeather(),
    fetchPendingReviewCount(createServerClient(), userId),
  ]);

  const calendarEvents =
    calendarRes.status === "fulfilled"
      ? todayEventsFromCal(calendarRes.value.events, dateKey)
      : [];

  // Silence the unused vars in destructuring — use as placeholder references
  void startOfTodayLocal;
  void endOfTodayLocal;

  return {
    dateKey,
    calendar: calendarEvents,
    topTasks: topTasks.status === "fulfilled" ? topTasks.value : [],
    blockers: blockers.status === "fulfilled" ? blockers.value : [],
    habits:
      habits.status === "fulfilled"
        ? habits.value
        : { done: 0, total: 6 },
    streak: streakDays.status === "fulfilled" ? streakDays.value : 0,
    finance: finance.status === "fulfilled" ? finance.value : null,
    weather: weather.status === "fulfilled" ? weather.value : null,
    reviewCount:
      reviewCount.status === "fulfilled" ? reviewCount.value : 0,
  };
}
