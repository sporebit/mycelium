/**
 * Habits on tickets (spec §8.3, Flag 5).
 *
 * A habit is a visible `series` ticket (kind = habit, FREQ=DAILY) whose
 * legacy id lives in meta.habit_id; a day's completion is a
 * ticket_completions row. This module is the only writer. During the
 * transition it also mirrors into the daily_logs JSON (notes.habits.done and
 * the sentinel row's habits_config) so the Today glance row, Operator card,
 * briefings and headlines — which still read the JSON — stay correct until
 * they are re-pointed and the old read path is dropped.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HABITS as DEFAULT_HABITS, type Habit } from "@/lib/config/habits";
import { getOrCreateDailyLog, parseNotes } from "@/lib/dailyLog";
import { GOALS_SENTINEL_DATE } from "@/lib/types/goals";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import { moveTicket, statusIdFor } from "@/lib/tickets/server";

export type HabitTicket = Habit & { ticket_id: string; ticket_key: string | null };

type Row = {
  id: string;
  ticket_key: string | null;
  title: string;
  sort_order: number;
  meta: Record<string, unknown> | null;
  space_id: string;
  ticket_status: { category: string } | { category: string }[] | null;
};

const HABIT_SELECT =
  "id, ticket_key, title, sort_order, meta, space_id, ticket_status:ticket_statuses(category)";

function toHabit(r: Row): HabitTicket {
  const m = r.meta ?? {};
  const out: HabitTicket = {
    id: typeof m.habit_id === "string" && m.habit_id ? m.habit_id : r.id,
    name: r.title,
    category: typeof m.category === "string" ? m.category : "HABIT",
    ticket_id: r.id,
    ticket_key: r.ticket_key,
  };
  if (typeof m.target === "number") out.target = m.target;
  if (typeof m.unit === "string") out.unit = m.unit;
  return out;
}

/** Open habit tickets in the caller's spaces, in tile order. */
export async function listHabits(db: SupabaseClient): Promise<HabitTicket[]> {
  const { data, error } = await db
    .from("tickets")
    .select(HABIT_SELECT)
    .eq("kind", "habit")
    .eq("recurrence_mode", "series")
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as unknown as Row[])
    .filter((r) => {
      const st = Array.isArray(r.ticket_status) ? r.ticket_status[0] : r.ticket_status;
      return st?.category !== "done" && st?.category !== "cancelled";
    })
    .map(toHabit);
}

/** Habit ids completed on a day. */
export async function doneOn(db: SupabaseClient, date: string): Promise<string[]> {
  const habits = await listHabits(db);
  if (habits.length === 0) return [];
  const byTicket = new Map(habits.map((h) => [h.ticket_id, h.id]));
  const { data, error } = await db
    .from("ticket_completions")
    .select("ticket_id")
    .eq("completed_on", date)
    .in("ticket_id", [...byTicket.keys()]);
  if (error) throw error;
  return (data ?? [])
    .map((r) => byTicket.get((r as { ticket_id: string }).ticket_id))
    .filter((x): x is string => !!x);
}

/** Set one habit done / not done for a day; mirrors into the daily-log JSON. */
export async function setDone(
  db: SupabaseClient,
  habitId: string,
  date: string,
  done: boolean,
  uid: string | null,
): Promise<string[]> {
  const habits = await listHabits(db);
  const habit = habits.find((h) => h.id === habitId || h.ticket_id === habitId);
  if (!habit) throw new Error("unknown habit");

  if (done) {
    const { error } = await db
      .from("ticket_completions")
      .upsert(
        { ticket_id: habit.ticket_id, completed_on: date, completed_by: uid },
        { onConflict: "ticket_id,completed_on", ignoreDuplicates: true },
      );
    if (error) throw error;
  } else {
    const { error } = await db
      .from("ticket_completions")
      .delete()
      .eq("ticket_id", habit.ticket_id)
      .eq("completed_on", date);
    if (error) throw error;
  }

  const ids = await doneOn(db, date);
  await mirrorDone(db, date, ids);
  return ids;
}

async function mirrorDone(db: SupabaseClient, date: string, ids: string[]): Promise<void> {
  try {
    const row = await getOrCreateDailyLog(db, date);
    const notes = parseNotes(row.notes);
    const merged = { ...notes, habits: { ...(notes.habits ?? {}), done: ids } };
    await db
      .from("daily_logs")
      .update({ notes: JSON.stringify(merged), updated_at: new Date().toISOString() })
      .eq("id", row.id);
  } catch (err) {
    console.error("[habits] daily_log mirror failed:", err);
  }
}

/** History for the heatmap: one entry per day, oldest first. */
export async function habitHistory(
  db: SupabaseClient,
  days: number,
): Promise<{ history: Array<{ date: string; completed: string[]; total: number }>; habits: HabitTicket[] }> {
  const habits = await listHabits(db);
  const today = localDateKey();
  let start = today;
  for (let i = 1; i < days; i++) start = previousDateKey(start);

  const byTicket = new Map(habits.map((h) => [h.ticket_id, h.id]));
  const byDate = new Map<string, string[]>();
  if (habits.length > 0) {
    const { data, error } = await db
      .from("ticket_completions")
      .select("ticket_id, completed_on")
      .in("ticket_id", [...byTicket.keys()])
      .gte("completed_on", start)
      .lte("completed_on", today)
      .limit(20000);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ ticket_id: string; completed_on: string }>) {
      const id = byTicket.get(r.ticket_id);
      if (!id) continue;
      byDate.set(r.completed_on, [...(byDate.get(r.completed_on) ?? []), id]);
    }
  }

  const history: Array<{ date: string; completed: string[]; total: number }> = [];
  // walk forward from start to today
  const dates: string[] = [];
  let cursor = today;
  for (let i = 0; i < days; i++) {
    dates.unshift(cursor);
    cursor = previousDateKey(cursor);
  }
  for (const d of dates) history.push({ date: d, completed: byDate.get(d) ?? [], total: habits.length });
  return { history, habits };
}

/** Consecutive days with ≥1 completion, today as a grace day. */
export async function habitStreak(db: SupabaseClient): Promise<number> {
  const habits = await listHabits(db);
  if (habits.length === 0) return 0;
  const today = localDateKey();
  let earliest = today;
  for (let i = 0; i < 400; i++) earliest = previousDateKey(earliest);
  const { data, error } = await db
    .from("ticket_completions")
    .select("completed_on")
    .in("ticket_id", habits.map((h) => h.ticket_id))
    .gte("completed_on", earliest)
    .lte("completed_on", today)
    .limit(20000);
  if (error) throw error;
  const days = new Set((data ?? []).map((r) => (r as { completed_on: string }).completed_on));
  let streak = 0;
  let date = today;
  let first = true;
  for (let i = 0; i < 400; i++) {
    if (days.has(date)) streak++;
    else if (!first) break;
    first = false;
    date = previousDateKey(date);
  }
  return streak;
}

/**
 * Save the habit list from the config modal: rename / re-target existing
 * tickets, create new ones, cancel removed ones. Mirrors habits_config into
 * the sentinel daily-log row for the readers still on the JSON.
 */
export async function saveHabits(
  db: SupabaseClient,
  habits: Habit[],
  uid: string | null,
): Promise<HabitTicket[]> {
  const existing = await listHabits(db);
  const byId = new Map(existing.map((h) => [h.id, h]));
  const keep = new Set<string>();
  const now = new Date().toISOString();

  // Which space do new tickets go in? The caller's own: same as existing
  // habit tickets, else the space the API insert defaults to.
  let spaceId: string | null = null;
  if (existing.length > 0) {
    const { data } = await db
      .from("tickets")
      .select("space_id")
      .eq("id", existing[0].ticket_id)
      .maybeSingle();
    spaceId = (data?.space_id as string | undefined) ?? null;
  }

  let idx = 0;
  for (const h of habits) {
    idx += 1;
    keep.add(h.id);
    const meta = {
      habit_id: h.id,
      category: h.category,
      target: h.target ?? null,
      unit: h.unit ?? null,
    };
    const cur = byId.get(h.id);
    if (cur) {
      const { error } = await db
        .from("tickets")
        .update({ title: h.name, meta, tags: [h.category], sort_order: idx, updated_at: now })
        .eq("id", cur.ticket_id);
      if (error) throw error;
    } else {
      const insert: Record<string, unknown> = {
        title: h.name,
        kind: "habit",
        recurrence_mode: "series",
        recurrence_rrule: "FREQ=DAILY",
        source: "ui",
        urgency: "someday",
        priority_score: 0.5,
        owner: uid,
        sort_order: idx,
        tags: [h.category],
        meta,
      };
      if (spaceId) {
        const sid = await statusIdFor(db, spaceId, "next");
        if (sid) insert.status_id = sid;
      }
      const { data, error } = await db.from("tickets").insert(insert).select("id").single();
      if (error || !data) throw error ?? new Error("insert failed");
      if (!insert.status_id) {
        // 0117 defaulted it to Inbox; habits live in Next
        await moveTicket(db, (data as { id: string }).id, "next");
      }
    }
  }
  for (const h of existing) {
    if (!keep.has(h.id)) await moveTicket(db, h.ticket_id, "cancelled");
  }

  // mirror config for the JSON readers
  try {
    const row = await getOrCreateDailyLog(db, GOALS_SENTINEL_DATE);
    const current = parseNotes(row.notes) as Record<string, unknown>;
    await db
      .from("daily_logs")
      .update({ notes: JSON.stringify({ ...current, habits_config: habits }), updated_at: now })
      .eq("id", row.id);
  } catch (err) {
    console.error("[habits] sentinel mirror failed:", err);
  }

  return listHabits(db);
}

/** Fallback when no habit tickets exist yet (a brand-new space). */
export function defaultHabits(): Habit[] {
  return DEFAULT_HABITS;
}
