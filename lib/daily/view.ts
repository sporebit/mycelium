/**
 * What the Today surfaces are given: the focus card on the phone, the Home
 * views on desktop and the wall, and the morning and evening prompts all
 * read this one shape. It is the "today" data contract the UI direction
 * asks for (claude/ui-direction.md): a view is a component fed by it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayLondon } from "@/lib/tickets/when";
import { shownMinutes } from "./propose";
import { currentItem, dayWon, ensurePlan, FINISHED_STATES, type FreeMinutesSetting, nextItem, type Plan, type PlanItemRow, slippedCards, type TicketBrief, timerRunning } from "./server";
import { defaultFirstStep } from "./words";

export type TodayCard = {
  item_id: string;
  ticket_id: string;
  key: string | null;
  title: string;
  project: string | null;
  is_win: boolean;
  position: number;
  state: PlanItemRow["state"];
  minutes: number;
  first_step: string;
  why: string | null;
  left_off: string | null;
  timer_ends_at: string | null;
  timer_minutes: number | null;
};

export type SwapOption = { ticket_id: string; key: string | null; title: string; project: string | null; minutes: number };

export type TodayView = {
  day: string;
  plan_id: string;
  status: Plan["status"];
  /** Proposed and not yet accepted: the card shows "Looks right". */
  needs_ok: boolean;
  won: boolean;
  current: TodayCard | null;
  then: TodayCard | null;
  items: TodayCard[];
  swap: SwapOption[];
  slipped: Array<TicketBrief & { days: number }>;
  timer_running: boolean;
  counts: { planned: number; finished: number; left: number };
};

export function cardOf(i: PlanItemRow): TodayCard {
  const title = i.ticket?.title ?? "(removed)";
  return {
    item_id: i.id,
    ticket_id: i.ticket_id,
    key: i.ticket?.key ?? null,
    title,
    project: i.ticket?.project_name ?? null,
    is_win: i.is_win,
    position: i.position,
    state: i.state,
    minutes: i.shown_minutes,
    first_step: i.first_step?.trim() || i.ticket?.next_step?.trim() || defaultFirstStep(title),
    why: i.why,
    left_off: i.ticket?.parked_note ?? null,
    timer_ends_at: i.timer_ends_at,
    timer_minutes: i.timer_minutes,
  };
}

async function swapOptions(db: SupabaseClient, plan: Plan, count = 2): Promise<SwapOption[]> {
  const inPlan = new Set(plan.items.filter((i) => i.state !== "swapped").map((i) => i.ticket_id));
  const ids = plan.bench.filter((id) => !inPlan.has(id) && !plan.excluded.includes(id)).slice(0, 8);
  if (!ids.length) return [];
  const { data } = await db
    .from("tickets")
    .select("id, ticket_key, title, time_estimate_min, project:projects(name), ticket_status:ticket_statuses(category)")
    .in("id", ids);
  type Row = { id: string; ticket_key: string | null; title: string; time_estimate_min: number | null; project: { name: string } | { name: string }[] | null; ticket_status: { category: string } | { category: string }[] | null };
  const rows = new Map(((data ?? []) as unknown as Row[]).map((r) => [r.id, r]));
  const out: SwapOption[] = [];
  for (const id of ids) {
    const r = rows.get(id);
    if (!r) continue;
    const cat = (Array.isArray(r.ticket_status) ? r.ticket_status[0] : r.ticket_status)?.category ?? "";
    if (cat === "done" || cat === "cancelled") continue;
    const project = Array.isArray(r.project) ? r.project[0] : r.project;
    out.push({ ticket_id: r.id, key: r.ticket_key, title: r.title, project: project?.name ?? null, minutes: shownMinutes(r.time_estimate_min) });
    if (out.length >= count) break;
  }
  return out;
}

export async function viewOf(db: SupabaseClient, plan: Plan, now: Date = new Date()): Promise<TodayView> {
  const live = plan.items.filter((i) => i.state !== "swapped").sort((a, b) => a.position - b.position);
  const cur = currentItem(plan);
  const then = nextItem(plan);
  const finished = live.filter((i) => FINISHED_STATES.includes(i.state)).length;
  const left = live.filter((i) => i.state === "planned" || i.state === "started").length;
  return {
    day: plan.day,
    plan_id: plan.id,
    status: plan.status,
    needs_ok: plan.status === "proposed",
    won: dayWon(plan),
    current: cur ? cardOf(cur) : null,
    then: then ? cardOf(then) : null,
    items: live.map(cardOf),
    swap: plan.status === "closed" ? [] : await swapOptions(db, plan),
    slipped: plan.status === "closed" ? [] : await slippedCards(db, plan),
    timer_running: timerRunning(plan, now),
    counts: { planned: live.length, finished, left },
  };
}

/** Today for the signed-in person, creating the proposal if the day has none yet. */
export async function todayView(db: SupabaseClient, uid: string, opts: { day?: string; freeMinutes?: FreeMinutesSetting; now?: Date } = {}): Promise<TodayView> {
  const plan = await ensurePlan(db, uid, opts.day ?? todayLondon(opts.now), { freeMinutes: opts.freeMinutes, now: opts.now });
  return viewOf(db, plan, opts.now);
}
