import { addDays, todayLondon } from "@/lib/tickets/when";
import type { SupabaseClient } from "@supabase/supabase-js";
import { previousDateKey } from "@/lib/util/date";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { isBlocker, sortBlockers, toBlockerRow } from "@/lib/blockers";
import type { BlockerRow } from "@/lib/blockers";
import type { Task } from "@/lib/types/task";
import { doneOn, habitStreak, listHabits } from "@/lib/habits/store";
import { getCalendarData, type CalendarEvent } from "@/lib/calendar/fetch";
import {
  getLatestSnapshot,
  getSnapshotHistory,
} from "@/lib/finance/persistSnapshot";
import { fetchWeather, type Weather } from "./weather";
import { fetchPendingReviewCount } from "@/lib/captures/reviewCount";
import type { FinanceData } from "@/lib/finance/types";
import { listTickets, type TicketRow } from "@/lib/tickets/query";

/** Tickets block (spec §8.2): scheduled today, overdue, and Done awaiting Phil's verification. */
export type TicketsBlock = { today: TicketRow[]; overdue: TicketRow[]; verify: TicketRow[] };

async function fetchTicketsBlock(supabase: SupabaseClient, dateKey: string): Promise<TicketsBlock> {
  const [todayRes, verifyRes] = await Promise.all([
    listTickets(supabase, { list: "today", limit: 40 }),
    listTickets(supabase, { categories: ["verify"], limit: 20 }),
  ]);
  const anchor = (t: TicketRow) => t.scheduled_on ?? t.deadline_on ?? t.due_date ?? null;
  const today = todayRes.tickets.filter((t) => anchor(t) === dateKey);
  const overdue = todayRes.tickets.filter((t) => (anchor(t) ?? dateKey) < dateKey);
  return { today, overdue, verify: verifyRes.tickets };
}

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
  tickets: TicketsBlock;
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

/** Key tickets due within seven days, soonest first (spec §18: urgency labels are gone). */
async function fetchTopTasks(supabase: SupabaseClient): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TASK_SELECT)
    .lte("deadline_on", addDays(todayLondon(), 7))
    .eq("key", true)
    .is("completed_at", null)
    .is("cancelled_at", null)
    .order("deadline_on", { ascending: true })
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
  supabase: SupabaseClient,
  dateKey: string
): Promise<BlockerRow[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TASK_SELECT)
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
  supabase: SupabaseClient,
  yesterdayKey: string
): Promise<{ done: number; total: number }> {
  // habits are series tickets (0118): completions yesterday over the habit tickets
  const [habits, done] = await Promise.all([listHabits(supabase), doneOn(supabase, yesterdayKey)]);
  return { done: done.length, total: habits.length || 6 };
}

async function fetchFinanceWithDelta(
  supabase: SupabaseClient,
  dateKey: string
): Promise<BriefingData["finance"]> {
  const latest = await getLatestSnapshot(supabase);
  if (!latest) return null;

  // Pull a short history to find yesterday (or closest prior).
  const history = await getSnapshotHistory(supabase, 2);
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
  supabase: SupabaseClient,
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
    tickets,
  ] = await Promise.allSettled([
    getCalendarData(supabase),
    fetchTopTasks(supabase),
    fetchTopBlockers(supabase, dateKey),
    fetchYesterdayHabits(supabase, yesterdayKey),
    habitStreak(supabase),
    fetchFinanceWithDelta(supabase, dateKey),
    fetchWeather(),
    fetchPendingReviewCount(supabase),
    fetchTicketsBlock(supabase, dateKey),
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
    tickets:
      tickets.status === "fulfilled" ? tickets.value : { today: [], overdue: [], verify: [] },
  };
}
