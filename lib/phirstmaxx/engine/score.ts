/**
 * PhirstMaxx engine — suggestion scoring.
 *
 * Deterministic and explainable: every factor is 0–1, the weights are
 * edited as "more/less" sliders and normalised on read, and `reasons` is
 * built from the breakdown so "why did it suggest that?" always has an
 * answer. The nine weights are the old app's (decision 2026-09-02): cost
 * 0.18, time use 0.14, travel 0.13, taste 0.18, novelty 0.09, time of day
 * 0.09, stars 0.05, sky 0.04, partner wish 0.10.
 *
 * Two terms from the new spec (§7) are here too: `variety` (not the same
 * kind as what you did lately) and `waited` (how long a thing has sat in the
 * list). They default to weight 0, so the old ranking is unchanged until the
 * engine-proposal path turns them up. Fit margin and the weather term come
 * from fit.ts and the forecast and are follow-ups (PORT-NOTES.md).
 */
import type { PmThing } from "../types";
import { skyScore } from "./sky";
import { londonClock } from "./time";
import type { DayPlan } from "./travel";

export type Season = "spring" | "summer" | "autumn" | "winter";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

/** What scoring and chains read of a thing. Field names follow PmThing. */
export type EngineThing = {
  id: string;
  name: string;
  /** Free-text kind: "walk", "food", "night_sky"… */
  kind: string | null;
  tags: string[];
  lat: number | null;
  lng: number | null;
  cost_pence: number | null;
  min_minutes: number | null;
  dog_rule: PmThing["dog_rule"];
  best_time_of_day: TimeOfDay[];
  seasons: Season[];
  /** person id to 0–3 stars */
  stars_by: Record<string, number>;
  /** When it was dropped; feeds `waited`. */
  created_at?: string;
};

export type ScoringWeights = {
  cost_fit: number;
  time_use: number;
  travel: number;
  taste: number;
  novelty: number;
  time_of_day: number;
  stars: number;
  sky: number;
  partner_wish: number;
  variety: number;
  waited: number;
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  cost_fit: 0.18,
  time_use: 0.14,
  travel: 0.13,
  taste: 0.18,
  novelty: 0.09,
  time_of_day: 0.09,
  stars: 0.05,
  sky: 0.04,
  partner_wish: 0.1,
  variety: 0,
  waited: 0,
};

/** Merges slider values over the defaults and scales them to sum to one. */
export function normaliseWeights(raw: Partial<ScoringWeights> = {}): ScoringWeights {
  const merged = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(merged) as Array<keyof ScoringWeights>) {
    const v = raw[k];
    if (typeof v === "number" && Number.isFinite(v)) merged[k] = Math.max(0, v);
  }
  const sum = Object.values(merged).reduce((s, v) => s + v, 0);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(merged) as Array<keyof ScoringWeights>) merged[k] = merged[k] / sum;
  return merged;
}

/** The parts of a window scoring reads. */
export type ScoreWindow = { start: number; end: number; day: string; minutes: number };

export type ScoreContext = {
  window: ScoreWindow;
  /** Pence left in the month's pot. */
  remainingBudgetPence: number;
  /** The dog is along in this window. */
  hasPet: boolean;
  /** person id to tag to 0..1 (learned from ratings; 0.5 = no opinion). */
  tasteWeights: Record<string, Record<string, number>>;
  /** thing id to ISO date last done. */
  lastDone: Record<string, string>;
  /** For night-sky things. Null cloud = unknown. */
  sky: { cloudCoverPercent: number | null; moonFraction: number } | null;
  /** Read through normaliseWeights, so sliders need not sum to one. */
  weights: Partial<ScoringWeights>;
  /** Whose suggestions these are; their partner's wishes get the boost. */
  forUserId: string;
  partnerUserId: string | null;
  /** Minutes to keep spare at the end of a window. */
  bufferMin: number;
  /** Kinds of the things done most recently, newest first; feeds `variety`. */
  recentKinds?: string[];
  now: number;
};

export type Candidate = { things: EngineThing[]; plan: DayPlan };

export type Scored = {
  candidate: Candidate;
  score: number;
  factors: Record<keyof ScoringWeights, number>;
  hard: { fitsTime: boolean; dogOk: boolean; seasonOk: boolean };
  reasons: string[];
};

export function seasonOf(day: string): Season {
  const m = Number(day.slice(5, 7));
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

export function timesOfDay(window: { start: number; end: number }): TimeOfDay[] {
  const out = new Set<TimeOfDay>();
  const startH = Number(londonClock(window.start).slice(0, 2));
  const endH = Number(londonClock(window.end - 1).slice(0, 2));
  for (let h = startH; h <= endH; h++) {
    if (h < 12) out.add("morning");
    else if (h < 17) out.add("afternoon");
    else if (h < 21) out.add("evening");
    else out.add("night");
  }
  return [...out];
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mean = (vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length;

function taste(things: EngineThing[], weights: Record<string, number> | undefined): number {
  if (!weights) return 0.5;
  const tags = things.flatMap((t) => (t.kind ? [...t.tags, t.kind] : t.tags));
  const known = tags.map((t) => weights[t]).filter((v): v is number => typeof v === "number");
  return known.length === 0 ? 0.5 : mean(known);
}

/** Never done: 1. Done recently: low, recovering over about six months. */
function novelty(things: EngineThing[], lastDone: Record<string, string>, now: number): number {
  return mean(
    things.map((t) => {
      const done = lastDone[t.id];
      return done ? clamp((now - Date.parse(done)) / 86_400_000 / 180) : 1;
    }),
  );
}

/** 1 when nothing recent was the same kind; a repeat of last time's kind scores lowest. */
function variety(things: EngineThing[], recent: string[] | undefined): number {
  if (!recent || recent.length === 0) return 1;
  return mean(
    things.map((t) => {
      const i = t.kind ? recent.indexOf(t.kind) : -1;
      return i < 0 ? 1 : i / recent.length;
    }),
  );
}

/** How long it has waited, full marks at three months. */
function waited(things: EngineThing[], now: number): number {
  return mean(things.map((t) => (t.created_at ? clamp((now - Date.parse(t.created_at)) / 86_400_000 / 90) : 0)));
}

export function scoreCandidate(c: Candidate, ctx: ScoreContext): Scored {
  const { window } = ctx;
  const weights = normaliseWeights(ctx.weights);
  const total = c.plan.totalMinutes;

  const fitsTime = total <= window.minutes - ctx.bufferMin;
  const dogOk = !ctx.hasPet || c.things.every((t) => t.dog_rule === "yes" || t.dog_rule === "outside_only");
  const season = seasonOf(window.day);
  const seasonOk = c.things.every((t) => t.seasons.length === 0 || t.seasons.includes(season));

  const cost = c.things.reduce((s, t) => s + (t.cost_pence ?? 0), 0);
  const cost_fit = cost === 0 ? 1 : ctx.remainingBudgetPence <= 0 ? 0 : 1 - clamp(cost / ctx.remainingBudgetPence);
  const time_use = clamp(1 - Math.abs(total / window.minutes - 0.8));
  const travel = 1 - clamp(c.plan.travelShare - 0.35);
  const tasteMe = taste(c.things, ctx.tasteWeights[ctx.forUserId]);
  const tastePartner = ctx.partnerUserId ? taste(c.things, ctx.tasteWeights[ctx.partnerUserId]) : tasteMe;
  const nov = novelty(c.things, ctx.lastDone, ctx.now);
  const tod = timesOfDay(window);
  const time_of_day = c.things.every((t) => t.best_time_of_day.length === 0 || t.best_time_of_day.some((x) => tod.includes(x))) ? 1 : 0.4;
  const stars = mean(
    c.things.map((t) => {
      const vals = Object.values(t.stars_by);
      return vals.length ? mean(vals) / 3 : 0;
    }),
  );
  const isSky = c.things.some((t) => t.kind === "night_sky");
  const sky = isSky && ctx.sky ? skyScore(ctx.sky.cloudCoverPercent, ctx.sky.moonFraction) : 0;
  // Partner starred it and it has not been done: "do more of what she wants".
  const partner = ctx.partnerUserId;
  const partner_wish = partner && c.things.some((t) => (t.stars_by[partner] ?? 0) >= 2 && !ctx.lastDone[t.id]) ? 1 : 0;

  const factors: Record<keyof ScoringWeights, number> = {
    cost_fit,
    time_use,
    travel,
    taste: (tasteMe + tastePartner) / 2,
    novelty: nov,
    time_of_day,
    stars,
    sky,
    partner_wish,
    variety: variety(c.things, ctx.recentKinds),
    waited: waited(c.things, ctx.now),
  };
  const raw = (Object.keys(weights) as Array<keyof ScoringWeights>).reduce((s, k) => s + weights[k] * factors[k], 0);

  const reasons: string[] = [];
  if (partner_wish === 1) reasons.push("your other half starred it");
  if (cost === 0) reasons.push("free");
  else if (cost_fit > 0.7) reasons.push("fits the budget");
  if (nov === 1) reasons.push("you haven't done it yet");
  if (travel === 1 && c.plan.travelShare < 0.2) reasons.push("hardly any driving");
  if (sky > 0.7) reasons.push("clear dark sky forecast");
  if (time_of_day === 1 && c.things.some((t) => t.best_time_of_day.length)) reasons.push("right time of day");
  if (stars >= 0.66) reasons.push("you both love it");
  if (time_use > 0.85) reasons.push("uses the time well");
  if (weights.waited > 0 && factors.waited >= 1) reasons.push("it has waited a while");

  return { candidate: c, score: Math.round(clamp(raw) * 100), factors, hard: { fitsTime, dogOk, seasonOk }, reasons: reasons.slice(0, 3) };
}

/** Candidates that pass the hard filters, best first. */
export function rank(candidates: Candidate[], ctx: ScoreContext): Scored[] {
  return candidates
    .map((c) => scoreCandidate(c, ctx))
    .filter((s) => s.hard.fitsTime && s.hard.dogOk && s.hard.seasonOk)
    .sort((a, b) => b.score - a.score);
}

/** "Shuffle": a fresh sample of `n` from the top ten, deterministic per seed. */
export function shuffleTop(ranked: Scored[], n: number, seed: number): Scored[] {
  let s = seed || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const arr = ranked.slice(0, 10);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}
