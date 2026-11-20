/**
 * The daily loop on the server (0161; master run §6).
 *
 * One plan per person per day: proposed (by lib/daily/propose.ts), accepted
 * with one tap or by itself after AUTO_ACCEPT_MINUTES, worked through one
 * card at a time, closed in the evening. Every function takes a client that
 * acts as the person (a request client, or one from withUser()), so RLS
 * decides what a plan may contain.
 *
 * The plan is the record; a ticket's own status is still the truth about
 * the ticket. Starting an item moves its ticket to Doing, finishing moves
 * it to Done, parking moves it back to Next with a "where I left off" note.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { moveTicket } from "@/lib/tickets/server";
import { countSteps, normaliseState, type StepsDefinition } from "@/lib/tickets/steps";
import { addDays, isoWeekday, todayLondon } from "@/lib/tickets/when";
import { type Candidate, freeMinutesFor, propose, shownMinutes, slippedDays, SLIPPED_DAYS, TINY_MIN } from "./propose";
import { DEFAULT_WIP_LIMIT } from "./settings";

/** Untouched for this long after the morning prompt, a proposed plan applies itself (research rule 16). */
export const AUTO_ACCEPT_MINUTES = 45;
export { DEFAULT_WIP_LIMIT };
export const DEFAULT_TIMER_MINUTES = 25;

export type ItemState = "planned" | "started" | "done" | "good_enough" | "moved" | "dropped" | "parked" | "not_now" | "swapped";
export const FINISHED_STATES: readonly ItemState[] = ["done", "good_enough"];
/** States that take an item off today's list without finishing it. */
export const SET_ASIDE_STATES: readonly ItemState[] = ["moved", "dropped", "parked", "not_now", "swapped"];

export type TicketBrief = {
  id: string;
  key: string | null;
  title: string;
  category: string | null;
  project_name: string | null;
  next_step: string | null;
  parked_note: string | null;
  deadline_on: string | null;
  scheduled_on: string | null;
};

export type PlanItemRow = {
  id: string;
  plan_id: string;
  ticket_id: string;
  position: number;
  is_win: boolean;
  shown_minutes: number;
  why: string | null;
  first_step: string | null;
  state: ItemState;
  started_at: string | null;
  timer_minutes: number | null;
  timer_ends_at: string | null;
  finished_at: string | null;
  moved_to: string | null;
  note: string | null;
  ticket: TicketBrief | null;
};

export type PlanRow = {
  id: string;
  day: string;
  status: "proposed" | "accepted" | "closed";
  accepted_by: "tap" | "auto" | "edit" | null;
  free_minutes: number;
  budget_minutes: number;
  bench: string[];
  slipped: string[];
  excluded: string[];
  proposed_at: string;
  prompted_at: string | null;
  accepted_at: string | null;
  closed_at: string | null;
  summary: Record<string, unknown>;
  space_id: string;
  created_by: string | null;
};

export type Plan = PlanRow & { items: PlanItemRow[] };

const PLAN_SELECT =
  "id, day, status, accepted_by, free_minutes, budget_minutes, bench, slipped, excluded, proposed_at, prompted_at, accepted_at, closed_at, summary, space_id, created_by";
const ITEM_SELECT =
  "id, plan_id, ticket_id, position, is_win, shown_minutes, why, first_step, state, started_at, timer_minutes, timer_ends_at, finished_at, moved_to, note";
const TICKET_SELECT =
  "id, ticket_key, title, scheduled_on, deadline_on, urgent, points, time_estimate_min, priority_score, now_score, someday, next_step, parked_note, slip_offered_on, steps_definition, steps_state, kind, assignee_id, project:projects(name), ticket_status:ticket_statuses!inner(category)";

type TicketRaw = {
  id: string;
  ticket_key: string | null;
  title: string;
  scheduled_on: string | null;
  deadline_on: string | null;
  urgent: boolean | null;
  points: number | null;
  time_estimate_min: number | null;
  priority_score: number | null;
  now_score: number | null;
  someday: boolean | null;
  next_step: string | null;
  parked_note: string | null;
  slip_offered_on: string | null;
  steps_definition: StepsDefinition | null;
  steps_state: unknown;
  kind: string | null;
  assignee_id: string | null;
  project: { name: string } | { name: string }[] | null;
  ticket_status: { category: string } | { category: string }[] | null;
};

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

function progressOf(t: TicketRaw): number | null {
  const { done, total } = countSteps(t.steps_definition, normaliseState(t.steps_state));
  return total > 0 ? done / total : null;
}

function briefOf(t: TicketRaw): TicketBrief {
  return {
    id: t.id,
    key: t.ticket_key,
    title: t.title,
    category: one(t.ticket_status)?.category ?? null,
    project_name: one(t.project)?.name ?? null,
    next_step: t.next_step,
    parked_note: t.parked_note,
    deadline_on: t.deadline_on,
    scheduled_on: t.scheduled_on,
  };
}

/** Open tickets in the person's OWN space that are theirs to do, as proposal candidates. */
export async function loadCandidates(db: SupabaseClient, uid: string, spaceId: string): Promise<Candidate[]> {
  const { data, error } = await db
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("space_id", spaceId)
    .is("deleted_at", null)
    .neq("kind", "habit")
    .in("ticket_status.category", ["inbox", "backlog", "next", "doing"])
    .or(`assignee_id.is.null,assignee_id.eq.${uid}`)
    .or("recurrence_mode.is.null,recurrence_mode.neq.spawn,series_id.not.is.null")
    .limit(600);
  if (error) throw new Error(`candidates failed: ${error.message}`);
  const rows = (data ?? []) as unknown as TicketRaw[];
  if (rows.length === 0) return [];

  // Open blockers: a ticket waiting on another open ticket is not a candidate.
  const ids = rows.map((r) => r.id);
  const blocked = new Set<string>();
  const { data: deps } = await db.from("ticket_dependencies").select("blocker_id, blocked_id").in("blocked_id", ids);
  const depRows = (deps ?? []) as Array<{ blocker_id: string; blocked_id: string }>;
  if (depRows.length) {
    const { data: blockers } = await db
      .from("tickets")
      .select("id, ticket_status:ticket_statuses(category)")
      .in("id", [...new Set(depRows.map((d) => d.blocker_id))]);
    const open = new Set(
      ((blockers ?? []) as Array<{ id: string; ticket_status: { category: string } | { category: string }[] | null }>)
        .filter((b) => !["done", "cancelled"].includes(one(b.ticket_status)?.category ?? ""))
        .map((b) => b.id),
    );
    for (const d of depRows) if (open.has(d.blocker_id)) blocked.add(d.blocked_id);
  }

  return rows.map((t) => ({
    id: t.id,
    key: t.ticket_key,
    title: t.title,
    category: one(t.ticket_status)?.category ?? "backlog",
    scheduled_on: t.scheduled_on,
    deadline_on: t.deadline_on,
    urgent: t.urgent === true,
    points: t.points,
    time_estimate_min: t.time_estimate_min,
    priority_score: t.priority_score,
    now_score: t.now_score,
    someday: t.someday === true,
    blocked: blocked.has(t.id),
    progress: progressOf(t),
    next_step: t.next_step,
    project_name: one(t.project)?.name ?? null,
    slip_offered: t.slip_offered_on != null,
  }));
}

async function personalSpaceOf(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.rpc("my_personal_space");
  if (error || typeof data !== "string") throw new Error(`no personal space: ${error?.message ?? "not signed in"}`);
  return data;
}

async function attachTickets(db: SupabaseClient, items: Omit<PlanItemRow, "ticket">[]): Promise<PlanItemRow[]> {
  if (items.length === 0) return [];
  const { data } = await db
    .from("tickets")
    .select(TICKET_SELECT.replace("ticket_statuses!inner", "ticket_statuses"))
    .in("id", items.map((i) => i.ticket_id));
  const byId = new Map(((data ?? []) as unknown as TicketRaw[]).map((t) => [t.id, briefOf(t)]));
  return items.map((i) => ({ ...i, ticket: byId.get(i.ticket_id) ?? null }));
}

/** The person's own plan for a day, or null. Applies the auto-accept if it is due. */
export async function getPlan(db: SupabaseClient, uid: string, day: string, now: Date = new Date()): Promise<Plan | null> {
  const { data, error } = await db.from("day_plans").select(PLAN_SELECT).eq("day", day).eq("created_by", uid).maybeSingle();
  if (error) throw new Error(`plan read failed: ${error.message}`);
  if (!data) return null;
  let plan = data as PlanRow;
  if (autoAcceptDue(plan, now)) plan = await acceptPlan(db, plan.id, "auto", now);
  const { data: items } = await db.from("day_plan_items").select(ITEM_SELECT).eq("plan_id", plan.id).order("position", { ascending: true });
  return { ...plan, items: await attachTickets(db, (items ?? []) as Omit<PlanItemRow, "ticket">[]) };
}

/** True when a proposed plan was prompted long enough ago to apply itself. Pure. */
export function autoAcceptDue(plan: Pick<PlanRow, "status" | "prompted_at">, now: Date = new Date()): boolean {
  if (plan.status !== "proposed" || !plan.prompted_at) return false;
  return now.getTime() - new Date(plan.prompted_at).getTime() >= AUTO_ACCEPT_MINUTES * 60_000;
}

export async function acceptPlan(db: SupabaseClient, planId: string, by: "tap" | "auto" | "edit", now: Date = new Date()): Promise<PlanRow> {
  const { data, error } = await db
    .from("day_plans")
    .update({ status: "accepted", accepted_by: by, accepted_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", planId)
    .eq("status", "proposed")
    .select(PLAN_SELECT)
    .maybeSingle();
  if (error) throw new Error(`accept failed: ${error.message}`);
  if (data) return data as PlanRow;
  // Already accepted (two taps, or the tap raced the auto-accept): return it as it stands.
  const { data: current } = await db.from("day_plans").select(PLAN_SELECT).eq("id", planId).single();
  return current as PlanRow;
}

export type FreeMinutesSetting = Partial<Record<number, number>> | null | undefined;

/**
 * The person's plan for `day`, proposing one if there is none. Idempotent:
 * the unique index on (space, person, day) means two callers get one plan.
 */
export async function ensurePlan(
  db: SupabaseClient,
  uid: string,
  day: string = todayLondon(),
  opts: { freeMinutes?: FreeMinutesSetting; firstStepFor?: (c: Candidate) => string | null; now?: Date } = {},
): Promise<Plan> {
  const existing = await getPlan(db, uid, day, opts.now);
  if (existing) return existing;

  const spaceId = await personalSpaceOf(db);
  const candidates = await loadCandidates(db, uid, spaceId);
  const free = freeMinutesFor(isoWeekday(day), opts.freeMinutes);
  const p = propose({ day, candidates, freeMinutes: free });
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const { data: plan, error } = await db
    .from("day_plans")
    .insert({ day, free_minutes: free, budget_minutes: p.budget_minutes, bench: p.bench.slice(0, 20), slipped: p.slipped, source: "rules" })
    .select(PLAN_SELECT)
    .single();
  if (error) {
    // 23505: another request created today's plan between the read and the insert.
    if (error.code === "23505") {
      const raced = await getPlan(db, uid, day, opts.now);
      if (raced) return raced;
    }
    throw new Error(`plan create failed: ${error.message}`);
  }

  if (p.items.length) {
    const rows = p.items.map((i) => {
      const c = byId.get(i.ticket_id);
      return {
        plan_id: (plan as PlanRow).id,
        ticket_id: i.ticket_id,
        position: i.position,
        is_win: i.is_win,
        shown_minutes: i.shown_minutes,
        why: i.why,
        first_step: (c && (c.next_step?.trim() || opts.firstStepFor?.(c))) || null,
      };
    });
    const { error: itemsError } = await db.from("day_plan_items").insert(rows);
    if (itemsError) throw new Error(`plan items failed: ${itemsError.message}`);
  }
  // A slipped ticket is offered once: remember that it has been.
  if (p.slipped.length) await db.from("tickets").update({ slip_offered_on: day }).in("id", p.slipped);

  return (await getPlan(db, uid, day, opts.now))!;
}

/** Mark that the morning prompt went out; the auto-accept clock starts here. */
export async function markPrompted(db: SupabaseClient, planId: string, now: Date = new Date()): Promise<void> {
  await db.from("day_plans").update({ prompted_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", planId).is("prompted_at", null);
}

/** The item the focus card shows: the one in progress, else the first not yet dealt with. */
export function currentItem(plan: Pick<Plan, "items">): PlanItemRow | null {
  const live = plan.items.filter((i) => i.state === "started" || i.state === "planned");
  return live.find((i) => i.state === "started") ?? live.sort((a, b) => a.position - b.position)[0] ?? null;
}

/** The item after the current one: the "then" peek (rule 9). */
export function nextItem(plan: Pick<Plan, "items">): PlanItemRow | null {
  const cur = currentItem(plan);
  const rest = plan.items.filter((i) => i.state === "planned" && i.id !== cur?.id).sort((a, b) => a.position - b.position);
  return rest[0] ?? null;
}

export function dayWon(plan: Pick<Plan, "items">): boolean {
  return plan.items.some((i) => i.is_win && FINISHED_STATES.includes(i.state));
}

/** A focus timer is running: nothing interrupts until it ends (rule 27). */
export function timerRunning(plan: Pick<Plan, "items"> | null, now: Date = new Date()): boolean {
  return !!plan?.items.some((i) => i.state === "started" && i.timer_ends_at && new Date(i.timer_ends_at).getTime() > now.getTime());
}

async function ticketsInProgress(db: SupabaseClient, uid: string, spaceId: string): Promise<Array<{ id: string; ticket_key: string | null; title: string }>> {
  const { data } = await db
    .from("tickets")
    .select("id, ticket_key, title, time_estimate_min, ticket_status:ticket_statuses!inner(category)")
    .eq("space_id", spaceId)
    .is("deleted_at", null)
    .neq("kind", "habit")
    .eq("ticket_status.category", "doing")
    .or(`assignee_id.is.null,assignee_id.eq.${uid}`)
    .limit(50);
  return ((data ?? []) as Array<{ id: string; ticket_key: string | null; title: string }>).map((t) => ({ id: t.id, ticket_key: t.ticket_key, title: t.title }));
}

export type ItemAction =
  | { action: "start"; minutes?: number; force?: boolean }
  | { action: "more_time"; minutes?: number }
  | { action: "done" }
  | { action: "good_enough"; note?: string }
  | { action: "park"; note?: string }
  | { action: "not_now" }
  | { action: "drop" }
  | { action: "move"; to?: string }
  | { action: "swap"; with_ticket_id: string }
  | { action: "first_step"; text: string };

export type ActionResult =
  | { ok: true; plan: Plan; won?: boolean }
  | { ok: false; status: number; error: string; wip?: { limit: number; in_progress: Array<{ id: string; ticket_key: string | null; title: string }> } };

async function patchItem(db: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("day_plan_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`item update failed: ${error.message}`);
}

/**
 * One action on one item of the person's plan. Each is a single tap on the
 * card; none asks for a reason.
 */
export async function actOnItem(
  db: SupabaseClient,
  uid: string,
  plan: Plan,
  itemId: string,
  input: ItemAction,
  opts: { wipLimit?: number; now?: Date } = {},
): Promise<ActionResult> {
  const now = opts.now ?? new Date();
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, status: 404, error: "No such item in this plan" };
  if (plan.status === "closed") return { ok: false, status: 409, error: "This day is closed" };
  const reload = async (extra: { won?: boolean } = {}): Promise<ActionResult> => ({ ok: true, plan: (await getPlan(db, uid, plan.day, now))!, ...extra });
  // Any action on a proposed plan is the person engaging with it: it is theirs now.
  if (plan.status === "proposed") await acceptPlan(db, plan.id, input.action === "swap" ? "edit" : "tap", now);

  switch (input.action) {
    case "start": {
      const minutes = Math.max(1, Math.min(180, Math.round(input.minutes ?? Math.min(item.shown_minutes, DEFAULT_TIMER_MINUTES))));
      const limit = opts.wipLimit ?? DEFAULT_WIP_LIMIT;
      // Park one to start one — but never for a five-minute thing, and never
      // for something already in progress (rule 21: the limit is soft).
      if (!input.force && item.ticket?.category !== "doing" && item.shown_minutes > TINY_MIN) {
        const inProgress = (await ticketsInProgress(db, uid, plan.space_id)).filter((t) => t.id !== item.ticket_id);
        if (inProgress.length >= limit) {
          return { ok: false, status: 409, error: `${inProgress.length} things are in progress. Park one to start this.`, wip: { limit, in_progress: inProgress } };
        }
      }
      const moved = await moveTicket(db, item.ticket_id, "doing", { extra: { parked_note: null, parked_at: null } });
      if (!moved.ok) return { ok: false, status: moved.status, error: moved.error };
      await patchItem(db, item.id, {
        state: "started",
        started_at: item.started_at ?? now.toISOString(),
        timer_minutes: minutes,
        timer_ends_at: new Date(now.getTime() + minutes * 60_000).toISOString(),
      });
      return reload();
    }
    case "more_time": {
      if (item.state !== "started") return { ok: false, status: 409, error: "This item is not in progress" };
      const minutes = Math.max(1, Math.min(120, Math.round(input.minutes ?? 10)));
      await patchItem(db, item.id, { timer_minutes: minutes, timer_ends_at: new Date(now.getTime() + minutes * 60_000).toISOString() });
      return reload();
    }
    case "done":
    case "good_enough": {
      const extra: Record<string, unknown> = { parked_note: null, parked_at: null };
      if (input.action === "good_enough") extra.resolution = "good_enough";
      const moved = await moveTicket(db, item.ticket_id, "done", { extra });
      if (!moved.ok) return { ok: false, status: moved.status, error: moved.error };
      await patchItem(db, item.id, {
        state: input.action,
        finished_at: now.toISOString(),
        timer_ends_at: null,
        note: input.action === "good_enough" ? (input.note?.trim() || null) : item.note,
      });
      return reload({ won: item.is_win });
    }
    case "park": {
      const note = input.note?.trim() || null;
      const moved = await moveTicket(db, item.ticket_id, "next", { extra: { parked_note: note, parked_at: now.toISOString() } });
      if (!moved.ok) return { ok: false, status: moved.status, error: moved.error };
      await patchItem(db, item.id, { state: "parked", timer_ends_at: null, note });
      return reload();
    }
    case "not_now": {
      await patchItem(db, item.id, { state: "not_now", timer_ends_at: null });
      await db.from("day_plans").update({ excluded: [...new Set([...plan.excluded, item.ticket_id])] }).eq("id", plan.id);
      return reload();
    }
    case "drop": {
      const moved = await moveTicket(db, item.ticket_id, "cancelled");
      if (!moved.ok) return { ok: false, status: moved.status, error: moved.error };
      await patchItem(db, item.id, { state: "dropped", timer_ends_at: null, finished_at: now.toISOString() });
      return reload();
    }
    case "move": {
      const to = input.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to) && input.to > plan.day ? input.to : addDays(plan.day, 1);
      const { error } = await db.from("tickets").update({ scheduled_on: to, slip_offered_on: null, updated_at: now.toISOString() }).eq("id", item.ticket_id);
      if (error) return { ok: false, status: 500, error: error.message };
      await patchItem(db, item.id, { state: "moved", moved_to: to, timer_ends_at: null });
      return reload();
    }
    case "swap": {
      if (!plan.bench.includes(input.with_ticket_id)) return { ok: false, status: 400, error: "That is not one of the alternatives offered" };
      if (item.state !== "planned") return { ok: false, status: 409, error: "Only an item that has not been started can be swapped" };
      await patchItem(db, item.id, { state: "swapped", is_win: false });
      const { data: t } = await db.from("tickets").select("id, time_estimate_min, next_step").eq("id", input.with_ticket_id).maybeSingle();
      if (!t) return { ok: false, status: 404, error: "That ticket is no longer there" };
      const row = t as { id: string; time_estimate_min: number | null; next_step: string | null };
      const { error } = await db.from("day_plan_items").insert({
        plan_id: plan.id,
        ticket_id: row.id,
        position: item.position,
        is_win: item.is_win,
        shown_minutes: shownMinutes(row.time_estimate_min),
        why: "Swapped in",
        first_step: row.next_step,
      });
      if (error) return { ok: false, status: 500, error: error.message };
      await db
        .from("day_plans")
        .update({ bench: [...plan.bench.filter((id) => id !== row.id), item.ticket_id] })
        .eq("id", plan.id);
      return reload();
    }
    case "first_step": {
      const text = input.text.trim().slice(0, 280) || null;
      await patchItem(db, item.id, { first_step: text });
      await db.from("tickets").update({ next_step: text }).eq("id", item.ticket_id);
      return reload();
    }
  }
}

export type CloseDecision = { item_id: string; decision: "done" | "good_enough" | "tomorrow" | "drop" | "keep" };

export type CloseSummary = {
  won: boolean;
  done: number;
  moved: number;
  dropped: number;
  parked: number;
  planned: number;
  started: number;
  first_start_minutes: number | null;
};

export function summarise(plan: Plan): CloseSummary {
  const items = plan.items.filter((i) => i.state !== "swapped");
  const count = (...states: ItemState[]) => items.filter((i) => states.includes(i.state)).length;
  const starts = items.map((i) => i.started_at).filter((s): s is string => !!s).sort();
  const base = plan.accepted_at ?? plan.prompted_at ?? plan.proposed_at;
  const firstStart = starts[0] ? Math.max(0, Math.round((new Date(starts[0]).getTime() - new Date(base).getTime()) / 60_000)) : null;
  return {
    won: dayWon(plan),
    done: count("done", "good_enough"),
    moved: count("moved"),
    dropped: count("dropped"),
    parked: count("parked"),
    planned: items.length,
    started: items.filter((i) => i.started_at).length,
    first_start_minutes: firstStart,
  };
}

/**
 * Evening close (rule 18): apply the per-item decisions and close the day.
 * "Close the day" is always allowed: anything left undecided simply moves
 * to tomorrow, with no count kept of how often.
 */
export async function closeDay(db: SupabaseClient, uid: string, plan: Plan, decisions: CloseDecision[] = [], now: Date = new Date()): Promise<Plan> {
  if (plan.status === "closed") return plan;
  const byItem = new Map(decisions.map((d) => [d.item_id, d.decision]));
  let current = plan;
  for (const item of plan.items) {
    if (item.state !== "planned" && item.state !== "started") continue;
    const decision = byItem.get(item.id) ?? "tomorrow";
    const action: ItemAction | null =
      decision === "done" ? { action: "done" }
      : decision === "good_enough" ? { action: "good_enough" }
      : decision === "drop" ? { action: "drop" }
      : decision === "keep" ? null
      : item.state === "started" ? { action: "park" }
      : { action: "move" };
    if (!action) continue;
    const r = await actOnItem(db, uid, current, item.id, action, { now });
    if (r.ok) current = r.plan;
  }
  const fresh = (await getPlan(db, uid, plan.day, now)) ?? current;
  const { error } = await db
    .from("day_plans")
    .update({ status: "closed", closed_at: now.toISOString(), summary: summarise(fresh), updated_at: now.toISOString() })
    .eq("id", plan.id);
  if (error) throw new Error(`close failed: ${error.message}`);
  return (await getPlan(db, uid, plan.day, now))!;
}

/** Tickets held back from the plan because their date slipped a week ago: one card each. */
export async function slippedCards(db: SupabaseClient, plan: Pick<PlanRow, "slipped" | "day">): Promise<Array<TicketBrief & { days: number }>> {
  if (!plan.slipped.length) return [];
  const { data } = await db.from("tickets").select(TICKET_SELECT.replace("ticket_statuses!inner", "ticket_statuses")).in("id", plan.slipped);
  return ((data ?? []) as unknown as TicketRaw[])
    .filter((t) => !["done", "cancelled"].includes(one(t.ticket_status)?.category ?? ""))
    .map((t) => {
      const b = briefOf(t);
      const days = slippedDays({ deadline_on: t.deadline_on, scheduled_on: t.scheduled_on } as Candidate, plan.day);
      return { ...b, days: Math.max(days, SLIPPED_DAYS) };
    });
}
