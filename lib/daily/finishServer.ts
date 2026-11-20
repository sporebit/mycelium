/**
 * The finish line, read from the database and acted on. The choosing is in
 * finish.ts (pure); this loads the rows and carries out the three exits.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { moveTicket } from "@/lib/tickets/server";
import { countSteps, normaliseState, type StepsDefinition } from "@/lib/tickets/steps";
import { type FinishCandidate, type FinishItem, finishLine } from "./finish";

type Row = {
  id: string;
  ticket_key: string | null;
  title: string;
  next_step: string | null;
  parked_note: string | null;
  updated_at: string;
  steps_definition: StepsDefinition | null;
  steps_state: unknown;
  ticket_status: { category: string } | Array<{ category: string }> | null;
};

const categoryOf = (s: Row["ticket_status"]): string => (Array.isArray(s) ? s[0]?.category : s?.category) ?? "";

/** A person's own open tickets that have something to measure. */
export async function loadFinishCandidates(db: SupabaseClient, uid: string): Promise<FinishCandidate[]> {
  const { data, error } = await db
    .from("tickets")
    .select("id, ticket_key, title, next_step, parked_note, updated_at, steps_definition, steps_state, ticket_status:ticket_statuses!inner(category)")
    .eq("created_by", uid)
    .is("deleted_at", null)
    .is("parent_task_id", null)
    .in("ticket_status.category", ["backlog", "next", "doing", "waiting", "verify"])
    .order("updated_at", { ascending: true })
    .limit(400);
  if (error) throw new Error(`finish line: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return [];

  // Sub-tasks: done out of those not dropped.
  const subtasks = new Map<string, { done: number; total: number }>();
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data: kids } = await db
      .from("tickets")
      .select("parent_task_id, ticket_status:ticket_statuses!inner(category)")
      .in("parent_task_id", ids.slice(i, i + 100))
      .is("deleted_at", null);
    for (const k of (kids ?? []) as unknown as Array<{ parent_task_id: string; ticket_status: Row["ticket_status"] }>) {
      const cat = categoryOf(k.ticket_status);
      if (cat === "cancelled") continue;
      const p = subtasks.get(k.parent_task_id) ?? { done: 0, total: 0 };
      p.total += 1;
      if (cat === "done") p.done += 1;
      subtasks.set(k.parent_task_id, p);
    }
  }

  return rows.map((r) => {
    const steps = r.steps_definition ? countSteps(r.steps_definition, normaliseState(r.steps_state)) : null;
    return {
      id: r.id,
      key: r.ticket_key,
      title: r.title,
      category: categoryOf(r.ticket_status),
      next_step: r.next_step,
      parked_note: r.parked_note,
      steps: steps && steps.total > 0 ? steps : null,
      subtasks: subtasks.get(r.id) ?? null,
      updated_at: r.updated_at,
    };
  });
}

export async function finishLineFor(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<FinishItem[]> {
  return finishLine(await loadFinishCandidates(db, uid), now);
}

export type FinishExit = "finish" | "good_enough" | "drop";

/**
 * Carry out an exit. Only for something that is on the line right now: the
 * three exits are offered there and nowhere else, so a stale tab or a
 * made-up id closes nothing.
 *   finish       it is done
 *   good_enough  closed as it is; what was left is recorded on the ticket
 *   drop         let go
 */
export async function exitFinishLine(db: SupabaseClient, uid: string, ticketId: string, exit: FinishExit, now: Date = new Date()): Promise<{ ok: true; items: FinishItem[] } | { ok: false; status: number; error: string }> {
  const line = await finishLineFor(db, uid, now);
  const item = line.find((i) => i.id === ticketId);
  if (!item) return { ok: false, status: 404, error: "That is not on the finish line." };
  const moved =
    exit === "drop"
      ? await moveTicket(db, ticketId, "cancelled")
      : await moveTicket(db, ticketId, "done", exit === "good_enough" ? { extra: { parked_note: `Closed as good enough. ${item.left}`, parked_at: now.toISOString() } } : {});
  if (!moved.ok) return { ok: false, status: moved.status, error: moved.error };
  return { ok: true, items: await finishLineFor(db, uid, now) };
}
