/**
 * Field guide progress (design §2.3, §1 D14). Everything here is derived
 * from the definition and the state and never stored. Isomorphic and pure:
 * every function that needs the time takes it as an argument.
 *
 * A phase is a sitting (D1). Exactly one phase is open: the first with an
 * unticked visible step. Estimates correct themselves from real ticks: a
 * finished phase's actual minutes are its last tick minus its first; the
 * ratio of actual to estimated over finished phases, clamped 0.5 to 3,
 * scales what is left. The definition is never rewritten.
 */
import { effectiveToggles, visibleSteps, type Phase, type Step, type StepsDefinition, type StepsState } from "@/lib/tickets/steps";

export const LONDON = "Europe/London";

export type PhaseState = "done" | "open" | "later";

export type PhaseProgress = {
  id: string;
  title: string;
  /** 1-based position among phases that have visible steps ("Sitting 3"). */
  n: number;
  phase: Phase;
  steps: Step[];
  done: number;
  total: number;
  pct: number;
  minutes_est: number;
  minutes_actual: number | null;
  /** Estimated minutes still to do in this phase, before correction. */
  minutes_left_est: number;
  state: PhaseState;
  /** Newest tick in the phase (ISO), when any. */
  last_at: string | null;
};

/** Toggles with the Field guide's well-known keys defaulted: mode "me". */
export function guideToggles(def: StepsDefinition, state: StepsState): Record<string, string> {
  const t = effectiveToggles(def, state);
  for (const [k, v] of Object.entries(state.toggles)) if (!(k in t)) t[k] = v;
  if (!t.mode) t.mode = "me";
  return t;
}

/** A step with `platforms` shows only when the `platform` toggle is one of them (no toggle chosen: shown). */
export function onPlatform(step: Step, toggles: Record<string, string>): boolean {
  if (!step.platforms || step.platforms.length === 0) return true;
  const p = toggles.platform;
  if (!p) return true;
  return step.platforms.includes(p);
}

/** The steps of a phase that count: the route rule of `visibleSteps`, then the platform rule. */
export function guideSteps(phase: Phase, toggles: Record<string, string>, def: StepsDefinition): Step[] {
  return visibleSteps(phase, toggles, def).filter((s) => onPlatform(s, toggles));
}

function stepMinutes(steps: Step[]): number {
  return steps.reduce((sum, s) => sum + (typeof s.minutes === "number" && s.minutes > 0 ? s.minutes : 0), 0);
}

function remainingEstimate(phase: Phase, steps: Step[], state: StepsState): number {
  const open = steps.filter((s) => !state.steps[s.id]?.done);
  const all = stepMinutes(steps);
  const left = stepMinutes(open);
  if (typeof phase.minutes === "number" && phase.minutes > 0) {
    if (all > 0) return (phase.minutes * left) / all;
    return steps.length ? (phase.minutes * open.length) / steps.length : 0;
  }
  return left;
}

/** Per phase: counts, estimate, actual when finished, and which one is open. Phases with no visible step are left out. */
export function phaseProgress(def: StepsDefinition, state: StepsState): PhaseProgress[] {
  const toggles = guideToggles(def, state);
  const out: PhaseProgress[] = [];
  let openTaken = false;
  for (const phase of def.phases ?? []) {
    const steps = guideSteps(phase, toggles, def);
    if (steps.length === 0) continue;
    const ticks = steps.map((s) => state.steps[s.id]).filter((t) => t?.done);
    const done = ticks.length;
    const total = steps.length;
    const times = ticks.map((t) => Date.parse(t!.at)).filter((n) => Number.isFinite(n));
    const finished = done === total;
    let st: PhaseState = "later";
    if (finished) st = "done";
    else if (!openTaken) {
      st = "open";
      openTaken = true;
    }
    const est = typeof phase.minutes === "number" && phase.minutes > 0 ? phase.minutes : stepMinutes(steps);
    const actual = finished && times.length >= 2 ? Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 60_000)) : null;
    out.push({
      id: phase.id,
      title: phase.title,
      n: out.length + 1,
      phase,
      steps,
      done,
      total,
      pct: total ? Math.round((done / total) * 100) : 0,
      minutes_est: est,
      minutes_actual: actual,
      minutes_left_est: remainingEstimate(phase, steps, state),
      state: st,
      last_at: times.length ? new Date(Math.max(...times)).toISOString() : null,
    });
  }
  return out;
}

/** D14: actual over estimated across finished phases with both known, clamped 0.5 to 3; 1 when nothing is known. */
export function correctionRatio(phases: PhaseProgress[]): number {
  let actual = 0;
  let est = 0;
  for (const p of phases) {
    if (p.state === "done" && p.minutes_actual !== null && p.minutes_est > 0) {
      actual += p.minutes_actual;
      est += p.minutes_est;
    }
  }
  if (est <= 0) return 1;
  return Math.min(3, Math.max(0.5, actual / est));
}

export type Overall = { done: number; total: number; pct: number; minutes_left_est: number; ratio: number };

export function overall(def: StepsDefinition, state: StepsState, phases: PhaseProgress[] = phaseProgress(def, state)): Overall {
  const done = phases.reduce((n, p) => n + p.done, 0);
  const total = phases.reduce((n, p) => n + p.total, 0);
  const ratio = correctionRatio(phases);
  const left = phases.filter((p) => p.state !== "done").reduce((n, p) => n + p.minutes_left_est, 0);
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, minutes_left_est: Math.round(left * ratio), ratio };
}

/** The first unticked visible step, in phase order. */
export function nextStep(def: StepsDefinition, state: StepsState, phases: PhaseProgress[] = phaseProgress(def, state)): { step: Step; phase: PhaseProgress } | null {
  for (const p of phases) {
    for (const s of p.steps) if (!state.steps[s.id]?.done) return { step: s, phase: p };
  }
  return null;
}

function londonDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LONDON, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "21:40" in London. */
export function londonTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "today", "yesterday", "on Thursday", "on 12 Nov": when `iso` was, seen from `now`, in London. */
export function dayWords(iso: string, now: Date): string {
  const then = new Date(iso);
  const diff = dayDiff(londonDate(then), londonDate(now));
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return `on ${new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, weekday: "long" }).format(then)}`;
  return `on ${new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, day: "numeric", month: "short" }).format(then)}`;
}

export type ResumePoint = {
  next: { id: string; title: string; phase_id: string };
  last: { id: string; at: string };
  /** "ticked 2.3 at 21:40 yesterday" */
  ticked: string;
  /** "Where you were: ticked 2.3 at 21:40 yesterday. Next: 2.4 Set the forward." */
  line: string;
};

/** Only when something is ticked and something is left. */
export function resumePoint(def: StepsDefinition, state: StepsState, now: Date, phases: PhaseProgress[] = phaseProgress(def, state)): ResumePoint | null {
  const next = nextStep(def, state, phases);
  if (!next) return null;
  let last: { id: string; at: string } | null = null;
  for (const p of phases) {
    for (const s of p.steps) {
      const t = state.steps[s.id];
      if (t?.done && (!last || Date.parse(t.at) > Date.parse(last.at))) last = { id: s.id, at: t.at };
    }
  }
  if (!last) return null;
  const ticked = `ticked ${last.id} at ${londonTime(last.at)} ${dayWords(last.at, now)}`;
  return {
    next: { id: next.step.id, title: next.step.title, phase_id: next.phase.id },
    last,
    ticked,
    line: `Where you were: ${ticked}. Next: ${next.step.id} ${next.step.title}.`,
  };
}

export type Freshness = "fresh" | "amber" | "unknown";

/** `last_verified` older than six months is amber ("check before trusting"); none is unknown. `today` is YYYY-MM-DD. */
export function freshness(def: StepsDefinition, today: string): Freshness {
  const lv = def.intro?.last_verified;
  if (!lv || !/^\d{4}-\d{2}-\d{2}/.test(lv)) return "unknown";
  const [y, m, d] = lv.slice(0, 10).split("-").map(Number);
  const limit = new Date(Date.UTC(y, m - 1 + 6, d)).toISOString().slice(0, 10);
  return today >= limit ? "amber" : "fresh";
}

/** "12 Nov 2026" from an ISO date. */
export function longDate(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, day: "numeric", month: "short", year: "numeric" }).format(d);
}

export type FlightRow = {
  n: number;
  id: string;
  title: string;
  /** Actual when finished and known; otherwise the estimate, corrected by D14 for what is not finished. */
  minutes: number;
  corrected: boolean;
  needs: string[];
  hard_part: string | null;
  state: PhaseState;
};

export type FlightPlan = { rows: FlightRow[]; total_minutes: number; minutes_left: number; summary: string; ratio: number };

export function flightPlan(def: StepsDefinition, state: StepsState, phases: PhaseProgress[] = phaseProgress(def, state)): FlightPlan {
  const ratio = correctionRatio(phases);
  const rows: FlightRow[] = phases.map((p) => {
    const done = p.state === "done";
    const minutes = done ? (p.minutes_actual ?? p.minutes_est) : Math.round(p.minutes_est * ratio);
    return {
      n: p.n,
      id: p.id,
      title: p.title,
      minutes,
      corrected: !done && ratio !== 1,
      needs: p.phase.needs ?? [],
      hard_part: p.phase.hard_part ?? null,
      state: p.state,
    };
  });
  const total = rows.reduce((n, r) => n + r.minutes, 0);
  const left = overall(def, state, phases).minutes_left_est;
  const count = rows.length;
  return {
    rows,
    total_minutes: total,
    minutes_left: left,
    summary: `${count} ${count === 1 ? "sitting" : "sittings"}, about ${total} ${total === 1 ? "minute" : "minutes"}`,
    ratio,
  };
}

/** "did not work at 14:02, then done at 14:20", or "done at 14:20", or "did not work at 14:02", or null. */
export function stepHistory(state: StepsState, stepId: string): string | null {
  const f = state.failures?.[stepId];
  const t = state.steps[stepId];
  const parts: string[] = [];
  if (f) parts.push(`did not work at ${londonTime(f.at)}`);
  if (t?.done) parts.push(`${f ? "then " : ""}done at ${londonTime(t.at)}`);
  return parts.length ? parts.join(", ") : null;
}

/** The London date one day after `now`, YYYY-MM-DD: where Park puts the ticket. */
export function tomorrowLondon(now: Date = new Date()): string {
  const today = londonDate(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Today in London, YYYY-MM-DD. */
export function todayLondonDate(now: Date = new Date()): string {
  return londonDate(now);
}
