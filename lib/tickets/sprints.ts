/**
 * Sprints (0123): a commitment layer on top of GTD for technical projects.
 * Tickets keep their category; `sprint_id` says which iteration they were
 * committed to. Points come from the Fibonacci `points` column; a ticket
 * counts as done when its category is done (or it has a completion row
 * dated inside the sprint, for the burndown).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "./recur";

export const SPRINT_SELECT =
  "id, project_id, name, goal, starts_on, ends_on, status, points_committed, points_done, closed_at, sort_order, created_at, updated_at";

export type SprintRow = {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  starts_on: string;
  ends_on: string;
  status: "planned" | "active" | "closed";
  points_committed: number | null;
  points_done: number | null;
  closed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SprintSummary = SprintRow & {
  tickets_total: number;
  tickets_done: number;
  points_total: number;
  points_finished: number;
  days_total: number;
  days_left: number;
};

type TicketLite = { id: string; points: number | null; category: string | null; completed_at: string | null };

async function sprintTickets(db: SupabaseClient, sprintId: string): Promise<TicketLite[]> {
  const { data } = await db
    .from("tickets")
    .select("id, points, completed_at, ticket_status:ticket_statuses(category)")
    .eq("sprint_id", sprintId)
    .is("deleted_at", null)
    .limit(500);
  return ((data ?? []) as unknown as Array<{ id: string; points: number | null; completed_at: string | null; ticket_status: { category: string } | { category: string }[] | null }>).map((r) => ({
    id: r.id,
    points: r.points,
    completed_at: r.completed_at,
    category: (Array.isArray(r.ticket_status) ? r.ticket_status[0] : r.ticket_status)?.category ?? null,
  }));
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export async function summarise(db: SupabaseClient, s: SprintRow, today: string): Promise<SprintSummary> {
  const ts = await sprintTickets(db, s.id);
  const done = ts.filter((t) => t.category === "done");
  const points = (xs: TicketLite[]) => xs.reduce((n, t) => n + (t.points ?? 0), 0);
  const daysTotal = daysBetween(s.starts_on, s.ends_on) + 1;
  const daysLeft = Math.max(0, Math.min(daysTotal, daysBetween(today, s.ends_on) + 1));
  return {
    ...s,
    tickets_total: ts.length,
    tickets_done: done.length,
    points_total: s.status === "closed" ? (s.points_committed ?? points(ts)) : points(ts),
    points_finished: s.status === "closed" ? (s.points_done ?? points(done)) : points(done),
    days_total: daysTotal,
    days_left: daysLeft,
  };
}

/** Points remaining per day of the sprint (ideal line vs actual), from completions. */
export async function burndown(db: SupabaseClient, s: SprintRow, today: string): Promise<Array<{ date: string; remaining: number; ideal: number }>> {
  const ts = await sprintTickets(db, s.id);
  const total = ts.reduce((n, t) => n + (t.points ?? 0), 0);
  const ids = ts.map((t) => t.id);
  const pts = new Map(ts.map((t) => [t.id, t.points ?? 0]));
  const doneOn = new Map<string, number>();
  if (ids.length) {
    const { data } = await db.from("ticket_completions").select("ticket_id, completed_on").in("ticket_id", ids).gte("completed_on", s.starts_on).lte("completed_on", s.ends_on);
    for (const r of (data ?? []) as Array<{ ticket_id: string; completed_on: string }>) {
      doneOn.set(r.completed_on, (doneOn.get(r.completed_on) ?? 0) + (pts.get(r.ticket_id) ?? 0));
    }
  }
  const days = daysBetween(s.starts_on, s.ends_on) + 1;
  const out: Array<{ date: string; remaining: number; ideal: number }> = [];
  let remaining = total;
  for (let i = 0; i < days; i++) {
    const d = addDays(s.starts_on, i);
    if (d <= today) remaining -= doneOn.get(d) ?? 0;
    out.push({ date: d, remaining: d <= today ? Math.max(0, remaining) : NaN, ideal: Math.round((total * (days - 1 - i)) / Math.max(1, days - 1)) });
  }
  return out.map((p) => ({ ...p, remaining: Number.isNaN(p.remaining) ? -1 : p.remaining }));
}

/** Close: snapshot velocity, carry unfinished tickets to `carryTo` (a planned sprint) or unassign them. */
export async function closeSprint(db: SupabaseClient, s: SprintRow, carryTo: string | null): Promise<SprintRow> {
  const ts = await sprintTickets(db, s.id);
  const done = ts.filter((t) => t.category === "done");
  const unfinished = ts.filter((t) => t.category !== "done" && t.category !== "cancelled").map((t) => t.id);
  const points = (xs: TicketLite[]) => xs.reduce((n, t) => n + (t.points ?? 0), 0);
  const now = new Date().toISOString();
  if (unfinished.length) {
    await db.from("tickets").update({ sprint_id: carryTo, updated_at: now }).in("id", unfinished);
  }
  const { data, error } = await db
    .from("sprints")
    .update({ status: "closed", closed_at: now, points_committed: points(ts), points_done: points(done), updated_at: now })
    .eq("id", s.id)
    .select(SPRINT_SELECT)
    .single();
  if (error || !data) throw error ?? new Error("close failed");
  return data as SprintRow;
}

/** Velocity: points done per closed sprint of the project, most recent first. */
export async function velocity(db: SupabaseClient, projectId: string): Promise<Array<{ name: string; points_done: number; points_committed: number }>> {
  const { data } = await db
    .from("sprints")
    .select("name, points_done, points_committed")
    .eq("project_id", projectId)
    .eq("status", "closed")
    .order("ends_on", { ascending: false })
    .limit(6);
  return ((data ?? []) as Array<{ name: string; points_done: number | null; points_committed: number | null }>).map((r) => ({
    name: r.name,
    points_done: r.points_done ?? 0,
    points_committed: r.points_committed ?? 0,
  }));
}
