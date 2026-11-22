/**
 * PhirstMaxx — plans, agreeing, and what follows (spec §7).
 *
 * A plan is proposed by a person (from a thing or a window) or by the engine
 * (a firm together-window of three hours or more in the next fortnight with
 * nothing in it). Each person answers yes, no or another time:
 *
 *   everyone yes      accepted: legs worked out for that window, the plan
 *                     written to the Family calendar with them (adapter),
 *                     and everyone told "it's on, leave by 12:10"
 *   any no            declined; the proposer is told
 *   another time      stays proposed; the proposer is told
 *   nobody by start   expired (expireProposals, from the cron)
 *
 * An accepted plan whose window is no longer a together-window is flagged
 * "conflicts now" to both, once. A done plan seeds a note on the family
 * timeline and counts on the thing. A partner's answer never counts against
 * the interruption budget; the engine's proposals and reminders do.
 *
 * `ctx` is the caller's PmCtx: who is acting, and who is in the space.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { removePlanFromCalendar, seedTimelineNote, writePlanToCalendar } from "./adapter";
import { type EngineWindow, formatDay, londonClock, londonDate } from "./engine";
import { type FitContext, fitForWindow, loadFitContext, thingsForWindow } from "./fitting";
import { leaveByClock, legsFromFit } from "./legs";
import { notifyPeople, notifyPerson } from "./notify";
import type { PmCtx } from "./server";
import type { FitResult, PmPlan, PmPlanLeg, PmPlanResponse, PmThing } from "./types";

export const PLAN_COLS = "id, kind, thing_id, title, starts_at, ends_at, status, proposed_by, calendar_entry_id, notes, score, expires_at, conflict, old_id, created_at, updated_at";
export const ENGINE = "engine";
export const ENGINE_PROPOSALS_A_WEEK = 2;
export const ENGINE_MIN_WINDOW_MINUTES = 180;
export const ENGINE_LOOKAHEAD_DAYS = 14;
export const REMINDER_HOURS = 2;
const PLANS_URL = "/phirstmaxx/plans";
const HOUR = 3_600_000;

export type PlanRow = PmPlan & { expires_at: string | null; conflict: string | null };
export type PlanFull = PlanRow & { responses: PmPlanResponse[]; legs: PmPlanLeg[] };
export type PlanResult = { ok: true; plan: PlanRow } | { ok: false; status: number; error: string };
export type ProposeInput = {
  thing_id: string | null;
  starts_at: string;
  ends_at: string;
  title?: string;
  kind?: "hold" | "plan";
  notes?: string;
  /** A person id, or "engine". Defaults to the caller. */
  proposed_by?: string;
};

const fail = (status: number, error: string): PlanResult => ({ ok: false, status, error });
const iso = (ms: number) => new Date(ms).toISOString();

/** "Sat 28 Nov, 13:00–17:30" */
export function spanInWords(startsAt: string, endsAt: string): string {
  const s = Date.parse(startsAt);
  const e = Date.parse(endsAt);
  return `${formatDay(londonDate(s))}, ${londonClock(s)}–${londonClock(e)}`;
}

const nameOf = (ctx: PmCtx, personId: string): string => (personId === ENGINE ? "PhirstMaxx" : (ctx.people.find((p) => p.id === personId)?.name ?? "Someone"));
const names = (ctx: PmCtx): Record<string, string> => Object.fromEntries(ctx.people.map((p) => [p.id, p.name]));
const others = (ctx: PmCtx, except: string): string[] => ctx.people.map((p) => p.id).filter((id) => id !== except);

async function loadPlan(db: SupabaseClient, spaceId: string, planId: string): Promise<PlanRow | null> {
  const { data, error } = await db.from("pm_plans").select(PLAN_COLS).eq("space_id", spaceId).eq("id", planId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PlanRow | null) ?? null;
}

async function savePlan(db: SupabaseClient, planId: string, patch: Record<string, unknown>): Promise<PlanRow> {
  const { data, error } = await db.from("pm_plans").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", planId).select(PLAN_COLS).single();
  if (error) throw new Error(error.message);
  return data as PlanRow;
}

async function responsesFor(db: SupabaseClient, planIds: string[]): Promise<PmPlanResponse[]> {
  if (planIds.length === 0) return [];
  const { data } = await db.from("pm_plan_responses").select("plan_id, person_id, answer, at").in("plan_id", planIds);
  return (data ?? []) as PmPlanResponse[];
}

async function legsFor(db: SupabaseClient, planIds: string[]): Promise<PmPlanLeg[]> {
  if (planIds.length === 0) return [];
  const { data } = await db.from("pm_plan_legs").select("plan_id, person_id, position, kind, from_label, to_label, starts_at, ends_at, minutes, mode, provider").in("plan_id", planIds).order("position");
  return (data ?? []) as PmPlanLeg[];
}

// ---------------------------------------------------------------------------
// Reading

export async function listPlans(db: SupabaseClient, spaceId: string, opts: { status?: string[]; from?: string; to?: string } = {}): Promise<PlanFull[]> {
  let q = db.from("pm_plans").select(PLAN_COLS).eq("space_id", spaceId).order("starts_at").limit(500);
  if (opts.status?.length) q = q.in("status", opts.status);
  if (opts.from) q = q.gte("ends_at", opts.from);
  if (opts.to) q = q.lt("starts_at", opts.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const plans = (data ?? []) as PlanRow[];
  const ids = plans.map((p) => p.id);
  const [responses, legs] = await Promise.all([responsesFor(db, ids), legsFor(db, ids)]);
  return plans.map((p) => ({ ...p, responses: responses.filter((r) => r.plan_id === p.id), legs: legs.filter((l) => l.plan_id === p.id) }));
}

// ---------------------------------------------------------------------------
// Proposing and answering

export async function proposePlan(db: SupabaseClient, ctx: PmCtx, input: ProposeInput): Promise<PlanResult> {
  const start = Date.parse(input.starts_at ?? "");
  const end = Date.parse(input.ends_at ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return fail(400, "A plan needs a start and an end.");
  if (end <= start) return fail(400, "The end comes after the start.");
  if (input.kind && input.kind !== "hold" && input.kind !== "plan") return fail(400, "kind is hold or plan.");
  const proposer = input.proposed_by ?? ctx.me.id;
  if (proposer !== ENGINE && !ctx.people.some((p) => p.id === proposer)) return fail(400, "The proposer is someone in this space.");

  let thing: Pick<PmThing, "id" | "name"> | null = null;
  if (input.thing_id) {
    const { data } = await db.from("pm_things").select("id, name").eq("space_id", ctx.spaceId).eq("id", input.thing_id).maybeSingle();
    if (!data) return fail(404, "No such thing here.");
    thing = data as Pick<PmThing, "id" | "name">;
  }
  const kind = input.kind ?? (thing ? "plan" : "hold");
  const title = (input.title ?? "").trim().slice(0, 200) || thing?.name || "Held for us";
  const row = {
    space_id: ctx.spaceId,
    created_by: ctx.uid,
    kind,
    thing_id: thing?.id ?? null,
    title,
    starts_at: iso(start),
    ends_at: iso(end),
    status: "proposed",
    proposed_by: proposer,
    notes: (input.notes ?? "").trim().slice(0, 2000) || null,
    expires_at: iso(start),
  };
  const ins = await db.from("pm_plans").insert(row).select(PLAN_COLS).single();
  if (ins.error) return fail(ins.error.code === "42501" ? 403 : 400, ins.error.message);
  let plan = ins.data as PlanRow;

  if (proposer !== ENGINE) {
    const { error } = await db.from("pm_plan_responses").upsert({ space_id: ctx.spaceId, plan_id: plan.id, person_id: proposer, answer: "yes", at: new Date().toISOString() }, { onConflict: "plan_id,person_id" });
    if (error) console.error("[phirstmaxx/plans] proposer's yes:", error.message);
  }

  const when = spanInWords(plan.starts_at, plan.ends_at);
  if (proposer === ENGINE) {
    await notifyPeople(db, ctx.spaceId, ctx.people.map((p) => p.id), { kind: "engine_proposal", title: `How about ${title}?`, body: `${when}. You are both free. Yes or No?`, url: PLANS_URL, plan_id: plan.id, thing_id: plan.thing_id ?? undefined, counts: true });
  } else {
    await notifyPeople(db, ctx.spaceId, others(ctx, proposer), { kind: "proposal", title: `${nameOf(ctx, proposer)} proposes ${title}`, body: `${when}. Yes or No?`, url: PLANS_URL, plan_id: plan.id, thing_id: plan.thing_id ?? undefined, counts: false });
  }
  plan = await settle(db, ctx, plan);
  return { ok: true, plan };
}

export async function respondToPlan(db: SupabaseClient, ctx: PmCtx, planId: string, answer: "yes" | "no" | "another_time"): Promise<PlanResult> {
  if (answer !== "yes" && answer !== "no" && answer !== "another_time") return fail(400, "The answer is yes, no or another_time.");
  let plan = await loadPlan(db, ctx.spaceId, planId);
  if (!plan) return fail(404, "No such plan.");
  if (plan.status !== "proposed") return fail(409, `That plan is ${plan.status}.`);
  const me = ctx.me.id;
  const { error } = await db.from("pm_plan_responses").upsert({ space_id: ctx.spaceId, plan_id: plan.id, person_id: me, answer, at: new Date().toISOString() }, { onConflict: "plan_id,person_id" });
  if (error) return fail(error.code === "42501" ? 403 : 400, error.message);

  const tell = plan.proposed_by === ENGINE ? others(ctx, me) : others(ctx, me).filter((id) => id === plan!.proposed_by);
  if (answer === "no") {
    plan = await savePlan(db, plan.id, { status: "declined" });
    await notifyPeople(db, ctx.spaceId, tell, { kind: "declined", title: `${nameOf(ctx, me)} said no to ${plan.title}`, body: spanInWords(plan.starts_at, plan.ends_at), url: PLANS_URL, plan_id: plan.id, counts: false });
    return { ok: true, plan };
  }
  if (answer === "another_time") {
    await notifyPeople(db, ctx.spaceId, tell, { kind: "another_time", title: `${nameOf(ctx, me)} suggests another time for ${plan.title}`, body: `Not ${spanInWords(plan.starts_at, plan.ends_at)}. Propose another?`, url: PLANS_URL, plan_id: plan.id, counts: false });
    return { ok: true, plan };
  }
  const before = plan.status;
  plan = await settle(db, ctx, plan);
  if (plan.status === before) {
    // not everyone has answered yet: the proposer hears the yes
    await notifyPeople(db, ctx.spaceId, tell, { kind: "agreed", title: `${nameOf(ctx, me)} said yes to ${plan.title}`, body: spanInWords(plan.starts_at, plan.ends_at), url: PLANS_URL, plan_id: plan.id, counts: false });
  }
  return { ok: true, plan };
}

/** Accept the plan when everyone in the space has said yes; otherwise leave it. */
async function settle(db: SupabaseClient, ctx: PmCtx, plan: PlanRow): Promise<PlanRow> {
  if (plan.status !== "proposed") return plan;
  const responses = await responsesFor(db, [plan.id]);
  const everyone = ctx.people.every((p) => responses.some((r) => r.person_id === p.id && r.answer === "yes"));
  return everyone ? accept(db, ctx, plan) : plan;
}

/** Legs for the plan's window, the calendar write, the word to everyone. */
async function accept(db: SupabaseClient, ctx: PmCtx, plan: PlanRow): Promise<PlanRow> {
  let legs: PmPlanLeg[] = [];
  if (plan.thing_id) {
    try {
      const { fit, ctx: fitCtx } = await fitForWindow(db, ctx.spaceId, plan.thing_id, { start: Date.parse(plan.starts_at), end: Date.parse(plan.ends_at) });
      if (fit) legs = await storeLegs(db, ctx, plan, fit, fitCtx);
    } catch (err) {
      console.error("[phirstmaxx/plans] legs:", err instanceof Error ? err.message : err);
    }
  }
  let saved = await savePlan(db, plan.id, { status: "accepted", conflict: null });
  try {
    const entryId = await writePlanToCalendar(db, ctx, saved, legs, names(ctx));
    saved = await savePlan(db, plan.id, { calendar_entry_id: entryId });
  } catch (err) {
    console.error("[phirstmaxx/plans] calendar:", err instanceof Error ? err.message : err);
  }
  const leaveBy = leaveByClock(legs);
  const both = ctx.people.length > 1 ? "Both agreed — it's on" : "It's on";
  await notifyPeople(db, ctx.spaceId, ctx.people.map((p) => p.id), {
    kind: "accepted",
    title: `${both}: ${saved.title}`,
    body: [spanInWords(saved.starts_at, saved.ends_at), leaveBy ? `Leave by ${leaveBy}.` : null].filter(Boolean).join(". "),
    url: PLANS_URL,
    plan_id: saved.id,
    thing_id: saved.thing_id ?? undefined,
    counts: false,
  });
  return saved;
}

async function storeLegs(db: SupabaseClient, ctx: PmCtx, plan: PlanRow, fit: FitResult, fitCtx: FitContext): Promise<PmPlanLeg[]> {
  const labels = Object.fromEntries(fitCtx.places.map((p) => [p.id, p.label]));
  const thingName = plan.title;
  const legs: PmPlanLeg[] = legsFromFit(fit, { from: labels, thing: thingName }).map((l) => ({ ...l, plan_id: plan.id }));
  await db.from("pm_plan_legs").delete().eq("plan_id", plan.id);
  if (legs.length === 0) return [];
  const { error } = await db.from("pm_plan_legs").insert(legs.map((l) => ({ ...l, space_id: ctx.spaceId })));
  if (error) throw new Error(error.message);
  return legs;
}

export async function cancelPlan(db: SupabaseClient, ctx: PmCtx, planId: string): Promise<PlanResult> {
  const plan = await loadPlan(db, ctx.spaceId, planId);
  if (!plan) return fail(404, "No such plan.");
  if (plan.status !== "proposed" && plan.status !== "accepted") return fail(409, `That plan is ${plan.status}.`);
  const saved = await savePlan(db, plan.id, { status: "cancelled" });
  try {
    if (await removePlanFromCalendar(db, ctx, plan)) await savePlan(db, plan.id, { calendar_entry_id: null });
  } catch (err) {
    console.error("[phirstmaxx/plans] calendar removal:", err instanceof Error ? err.message : err);
  }
  await notifyPeople(db, ctx.spaceId, others(ctx, ctx.me.id), { kind: "cancelled", title: `${nameOf(ctx, ctx.me.id)} cancelled ${plan.title}`, body: spanInWords(plan.starts_at, plan.ends_at), url: PLANS_URL, plan_id: plan.id, counts: false });
  return { ok: true, plan: saved };
}

export async function markDone(db: SupabaseClient, ctx: PmCtx, planId: string, note?: string): Promise<PlanResult> {
  const plan = await loadPlan(db, ctx.spaceId, planId);
  if (!plan) return fail(404, "No such plan.");
  if (plan.status !== "accepted") return fail(409, `That plan is ${plan.status}.`);
  const saved = await savePlan(db, plan.id, { status: "done" });
  try {
    await seedTimelineNote(db, ctx, saved, note);
  } catch (err) {
    console.error("[phirstmaxx/plans] timeline note:", err instanceof Error ? err.message : err);
  }
  if (saved.thing_id) {
    const { data } = await db.from("pm_things").select("done_count").eq("id", saved.thing_id).maybeSingle();
    const count = Number((data as { done_count?: number } | null)?.done_count ?? 0) + 1;
    await db.from("pm_things").update({ done_count: count, updated_at: new Date().toISOString() }).eq("id", saved.thing_id);
  }
  return { ok: true, plan: saved };
}

// ---------------------------------------------------------------------------
// The cron's work

/** Unanswered proposals whose window has begun are expired. Returns how many. */
export async function expireProposals(db: SupabaseClient, spaceId: string, now: Date = new Date()): Promise<number> {
  const at = now.toISOString();
  const a = await db.from("pm_plans").update({ status: "expired", updated_at: at }).eq("space_id", spaceId).eq("status", "proposed").lt("expires_at", at).select("id");
  if (a.error) throw new Error(a.error.message);
  const b = await db.from("pm_plans").update({ status: "expired", updated_at: at }).eq("space_id", spaceId).eq("status", "proposed").is("expires_at", null).lt("starts_at", at).select("id");
  return (a.data ?? []).length + (b.data ?? []).length;
}

/** Why a span is no longer a together-window: who is busy, or that it has gone. */
export function conflictReason(ctx: FitContext, span: { start: number; end: number }, people: Record<string, string>): string {
  const busy: string[] = [];
  for (const [pid, blocks] of Object.entries(ctx.blocks)) {
    const hit = blocks.find((b) => b.kind !== "free" && b.start < span.end && b.end > span.start);
    if (hit) busy.push(`${people[pid] ?? "Someone"} now has ${hit.kind} ${londonClock(hit.start)}–${londonClock(hit.end)}`);
  }
  return busy.length ? busy.join("; ") : "no longer inside a window when you are both free";
}

const inside = (windows: readonly EngineWindow[], span: { start: number; end: number }) => windows.some((w) => w.start <= span.start && w.end >= span.end);

/**
 * Accepted plans ahead are checked against today's windows. One that has
 * fallen out is flagged with the reason and both are told once (a marker
 * in `score` stops repeats); one that fits again is cleared.
 */
export async function markConflicts(db: SupabaseClient, ctx: PmCtx, now: Date = new Date()): Promise<{ flagged: number; cleared: number }> {
  const { data, error } = await db.from("pm_plans").select(PLAN_COLS).eq("space_id", ctx.spaceId).eq("status", "accepted").gt("ends_at", now.toISOString()).order("starts_at").limit(50);
  if (error) throw new Error(error.message);
  const plans = (data ?? []) as PlanRow[];
  if (plans.length === 0) return { flagged: 0, cleared: 0 };
  const range = { start: Math.min(...plans.map((p) => Date.parse(p.starts_at))) - 12 * HOUR, end: Math.max(...plans.map((p) => Date.parse(p.ends_at))) + 12 * HOUR };
  const fitCtx = await loadFitContext(db, ctx.spaceId, range);
  const who = names(ctx);
  let flagged = 0;
  let cleared = 0;
  for (const plan of plans) {
    const span = { start: Date.parse(plan.starts_at), end: Date.parse(plan.ends_at) };
    const ok = inside(fitCtx.windows, span);
    if (!ok && !plan.conflict) {
      const reason = conflictReason(fitCtx, span, who);
      const marker = plan.score?.conflict_notified;
      await savePlan(db, plan.id, { conflict: reason, score: { ...(plan.score ?? {}), conflict_notified: now.getTime() } });
      flagged += 1;
      if (!marker) {
        await notifyPeople(db, ctx.spaceId, ctx.people.map((p) => p.id), { kind: "conflict", title: `${plan.title} conflicts now`, body: `${spanInWords(plan.starts_at, plan.ends_at)}: ${reason}.`, url: PLANS_URL, plan_id: plan.id, counts: true }, now);
      }
    } else if (ok && plan.conflict) {
      const score = { ...(plan.score ?? {}) };
      delete score.conflict_notified;
      await savePlan(db, plan.id, { conflict: null, score });
      cleared += 1;
    }
  }
  return { flagged, cleared };
}

/**
 * The engine proposes: firm together-windows of three hours or more in the
 * next fourteen days with no plan in them get the best-fitting ready thing.
 * At most two a week per space; never two for one window; never a thing
 * that already has a live plan.
 */
export async function engineProposals(db: SupabaseClient, ctx: PmCtx, now: Date = new Date()): Promise<PlanRow[]> {
  const t = now.getTime();
  const range = { start: t, end: t + ENGINE_LOOKAHEAD_DAYS * 24 * HOUR };
  const weekAgo = iso(t - 7 * 24 * HOUR);
  const [fitCtx, live, recent] = await Promise.all([
    loadFitContext(db, ctx.spaceId, range),
    db.from("pm_plans").select("id, thing_id, starts_at, ends_at, status").eq("space_id", ctx.spaceId).in("status", ["proposed", "accepted"]).lt("starts_at", iso(range.end)).gt("ends_at", iso(range.start)),
    db.from("pm_plans").select("id", { count: "exact", head: true }).eq("space_id", ctx.spaceId).eq("proposed_by", ENGINE).gte("created_at", weekAgo),
  ]);
  const livePlans = (live.data ?? []) as Array<{ thing_id: string | null; starts_at: string; ends_at: string }>;
  let remaining = ENGINE_PROPOSALS_A_WEEK - (recent.count ?? 0);
  const made: PlanRow[] = [];
  if (remaining <= 0) return made;
  const taken = new Set(livePlans.map((p) => p.thing_id).filter((x): x is string => !!x));
  const windows = fitCtx.windows.filter((w) => w.firmness === "firm" && !w.tentative && w.minutes >= ENGINE_MIN_WINDOW_MINUTES && w.start > t);
  for (const w of windows) {
    if (remaining <= 0) break;
    if (livePlans.some((p) => Date.parse(p.starts_at) < w.end && Date.parse(p.ends_at) > w.start)) continue;
    const ranked = (await thingsForWindow(db, ctx.spaceId, { start: w.start, end: w.end }, { now: t })).filter((r) => r.fit.verdict === "fits" && !taken.has(r.thing.id));
    const best = ranked[0];
    if (!best || best.fit.arrive_at === null || best.fit.leave_at === null) continue;
    const r = await proposePlan(db, ctx, { thing_id: best.thing.id, starts_at: iso(best.fit.arrive_at), ends_at: iso(best.fit.leave_at), kind: "plan", title: best.thing.name, notes: best.reasons.join(", ") || undefined, proposed_by: ENGINE });
    if (!r.ok) {
      console.error("[phirstmaxx/plans] engine proposal:", r.error);
      continue;
    }
    made.push(r.plan);
    taken.add(best.thing.id);
    livePlans.push({ thing_id: best.thing.id, starts_at: r.plan.starts_at, ends_at: r.plan.ends_at });
    remaining -= 1;
  }
  return made;
}

/** "Leave by 12:10 for Hackfall Woods": once per person per accepted plan, inside the two hours before they must leave. */
export async function leaveByReminders(db: SupabaseClient, ctx: PmCtx, now: Date = new Date()): Promise<number> {
  const t = now.getTime();
  const { data, error } = await db.from("pm_plans").select(PLAN_COLS).eq("space_id", ctx.spaceId).eq("status", "accepted").gt("starts_at", iso(t - HOUR)).lt("starts_at", iso(t + (REMINDER_HOURS + 3) * HOUR)).limit(20);
  if (error) throw new Error(error.message);
  const plans = (data ?? []) as PlanRow[];
  if (plans.length === 0) return 0;
  const legs = await legsFor(db, plans.map((p) => p.id));
  let sent = 0;
  for (const plan of plans) {
    const score = { ...(plan.score ?? {}) };
    let changed = false;
    for (const person of ctx.people) {
      const key = `reminded_${person.id}`;
      if (score[key]) continue;
      const leave = legs.find((l) => l.plan_id === plan.id && l.person_id === person.id && l.kind === "leave");
      const leaveAt = leave ? Date.parse(leave.starts_at) : Date.parse(plan.starts_at);
      if (leaveAt - t > REMINDER_HOURS * HOUR || leaveAt < t - 15 * 60_000) continue;
      await notifyPerson(db, ctx.spaceId, person.id, { kind: "leave_by", title: `Leave by ${londonClock(leaveAt)} for ${plan.title}`, body: spanInWords(plan.starts_at, plan.ends_at), url: PLANS_URL, plan_id: plan.id, thing_id: plan.thing_id ?? undefined, counts: true }, now);
      score[key] = t;
      changed = true;
      sent += 1;
    }
    if (changed) await savePlan(db, plan.id, { score });
  }
  return sent;
}
