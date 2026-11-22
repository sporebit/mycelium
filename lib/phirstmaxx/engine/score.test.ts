import { describe, expect, it } from "vitest";
import { BEACON_WALK, CHIPPY, ITALIAN, KIELDER, POOL, SUMMER_ONLY, thing } from "./__fixtures__/things";
import { buildChains } from "./chains";
import {
  DEFAULT_WEIGHTS,
  normaliseWeights,
  rank,
  scoreCandidate,
  seasonOf,
  shuffleTop,
  timesOfDay,
  type Candidate,
  type EngineThing,
  type ScoreContext,
  type ScoreWindow,
} from "./score";
import { londonTime } from "./time";
import { planDay, type Point } from "./travel";

const philHome: Point = { key: "ph", label: "Phil", lat: 54.52, lng: -1.55 };
const kirstyHome: Point = { key: "kh", label: "Kirsty", lat: 54.48, lng: -1.62 };

function win(day: string, start: string, end: string): ScoreWindow {
  const s = londonTime(day, start);
  const e = londonTime(day, end);
  return { start: s, end: e, minutes: (e - s) / 60_000, day };
}

function cand(things: EngineThing[]): Candidate {
  const first = things[0];
  const point: Point = { key: first.id, label: first.name, lat: first.lat, lng: first.lng };
  const activity = things.reduce((s, t) => s + (t.min_minutes ?? 120), 0);
  return {
    things,
    plan: planDay({
      mode: "pickup_by_a",
      idea: point,
      activityMinutes: activity,
      a: { start: philHome, home: philHome },
      b: { start: kirstyHome, home: kirstyHome },
    }),
  };
}

function ctx(window: ScoreWindow, extra: Partial<ScoreContext> = {}): ScoreContext {
  return {
    window,
    remainingBudgetPence: 20_000,
    hasPet: false,
    tasteWeights: {},
    lastDone: {},
    sky: null,
    weights: DEFAULT_WEIGHTS,
    forUserId: "phil",
    partnerUserId: "kirsty",
    bufferMin: 15,
    now: Date.parse("2026-08-20T12:00:00Z"),
    ...extra,
  };
}

const ids = (xs: { candidate: Candidate }[]) => xs.map((r) => r.candidate.things[0].id);

describe("helpers", () => {
  it("knows the seasons", () => {
    expect(seasonOf("2026-03-01")).toBe("spring");
    expect(seasonOf("2026-07-15")).toBe("summer");
    expect(seasonOf("2026-10-31")).toBe("autumn");
    expect(seasonOf("2026-12-25")).toBe("winter");
  });
  it("maps a window to the times of day it touches", () => {
    expect(timesOfDay(win("2026-08-21", "18:30", "22:00"))).toEqual(["evening", "night"]);
    expect(timesOfDay(win("2026-08-21", "09:00", "11:00"))).toEqual(["morning"]);
  });
  it("weights sum to one", () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe("hard filters", () => {
  const evening = win("2026-08-21", "18:30", "22:00");

  it("drops anything that doesn't fit the window", () => {
    const long = thing({ id: "long", name: "All-day thing", min_minutes: 600, lat: 54.5, lng: -1.58 });
    expect(ids(rank([cand([long]), cand([BEACON_WALK])], ctx(evening)))).toEqual(["beacon"]);
  });

  it("drops no-dog things when the dog is along", () => {
    const ranked = rank([cand([ITALIAN]), cand([BEACON_WALK]), cand([CHIPPY])], ctx(evening, { hasPet: true }));
    expect(ids(ranked).sort()).toEqual(["beacon", "chippy"]);
  });

  it("drops out-of-season things", () => {
    const winter = win("2026-12-05", "12:00", "16:00");
    expect(ids(rank([cand([SUMMER_ONLY]), cand([BEACON_WALK])], ctx(winter)))).toEqual(["beacon"]);
  });
});

describe("soft factors", () => {
  const evening = win("2026-08-21", "18:30", "22:00");

  it("free things get full cost_fit; expensive ones taper with the budget", () => {
    const free = scoreCandidate(cand([BEACON_WALK]), ctx(evening));
    const pricey = scoreCandidate(cand([ITALIAN]), ctx(evening, { remainingBudgetPence: 5000 }));
    expect(free.factors.cost_fit).toBe(1);
    expect(pricey.factors.cost_fit).toBeCloseTo(0.1, 5);
    const broke = scoreCandidate(cand([ITALIAN]), ctx(evening, { remainingBudgetPence: 0 }));
    expect(broke.factors.cost_fit).toBe(0);
  });

  it("boosts what the partner starred and hasn't done", () => {
    const wished = scoreCandidate(cand([ITALIAN]), ctx(evening));
    expect(wished.factors.partner_wish).toBe(1);
    expect(wished.reasons).toContain("your other half starred it");
    const done = scoreCandidate(cand([ITALIAN]), ctx(evening, { lastDone: { italian: "2026-08-01" } }));
    expect(done.factors.partner_wish).toBe(0);
  });

  it("novelty decays after doing something and recovers over six months", () => {
    const fresh = scoreCandidate(cand([BEACON_WALK]), ctx(evening)).factors.novelty;
    const lastWeek = scoreCandidate(cand([BEACON_WALK]), ctx(evening, { lastDone: { beacon: "2026-08-14" } })).factors.novelty;
    const lastYear = scoreCandidate(cand([BEACON_WALK]), ctx(evening, { lastDone: { beacon: "2025-08-14" } })).factors.novelty;
    expect(fresh).toBe(1);
    expect(lastWeek).toBeLessThan(0.1);
    expect(lastYear).toBe(1);
  });

  it("rewards the right time of day", () => {
    const eve = scoreCandidate(cand([BEACON_WALK]), ctx(evening)).factors.time_of_day;
    const morn = scoreCandidate(cand([BEACON_WALK]), ctx(win("2026-08-21", "08:00", "11:00"))).factors.time_of_day;
    expect(eve).toBe(1);
    expect(morn).toBe(0.4);
  });

  it("night-sky things need a clear, dark sky to score the bonus", () => {
    const night = win("2026-08-21", "19:00", "23:00");
    const clear = scoreCandidate(cand([KIELDER]), ctx(night, { sky: { cloudCoverPercent: 10, moonFraction: 0.1 } }));
    const cloudy = scoreCandidate(cand([KIELDER]), ctx(night, { sky: { cloudCoverPercent: 90, moonFraction: 0.1 } }));
    const full = scoreCandidate(cand([KIELDER]), ctx(night, { sky: { cloudCoverPercent: 10, moonFraction: 0.98 } }));
    expect(clear.factors.sky).toBe(1);
    expect(cloudy.factors.sky).toBe(0);
    expect(full.factors.sky).toBe(0);
    expect(clear.reasons).toContain("clear dark sky forecast");
  });

  it("uses learned taste, defaulting to neutral", () => {
    const neutral = scoreCandidate(cand([BEACON_WALK]), ctx(evening)).factors.taste;
    const loved = scoreCandidate(
      cand([BEACON_WALK]),
      ctx(evening, { tasteWeights: { phil: { outdoors: 0.9, romance: 0.9 }, kirsty: { outdoors: 0.7 } } }),
    ).factors.taste;
    expect(neutral).toBe(0.5);
    expect(loved).toBeCloseTo((0.9 + 0.7) / 2, 5);
  });
});

describe("ranking a real evening", () => {
  it("puts the free, dog-friendly, starred-by-partner things sensibly", () => {
    const evening = win("2026-08-21", "18:30", "22:00");
    const ranked = rank(POOL.map((t) => cand([t])), ctx(evening));
    const got = ids(ranked);
    // Kielder is 90 minutes away; it can't fit a 3.5 h window and is gone.
    expect(got).not.toContain("kielder");
    // The lido is summer-only and August is summer, so it's allowed.
    expect(got).toContain("lido");
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    expect(ranked.every((r) => r.score >= 0 && r.score <= 100)).toBe(true);
    // Every suggestion has a why.
    expect(ranked.every((r) => r.reasons.length > 0)).toBe(true);
  });

  it("shuffle is deterministic per seed and stays within the top ten", () => {
    const evening = win("2026-08-21", "18:30", "22:00");
    const ranked = rank(POOL.map((t) => cand([t])), ctx(evening));
    const a = ids(shuffleTop(ranked, 3, 7));
    const b = ids(shuffleTop(ranked, 3, 7));
    expect(a).toEqual(b);
    expect(a.every((id) => ids(ranked.slice(0, 10)).includes(id))).toBe(true);
  });
});

describe("chains", () => {
  it("pairs a walk with a nearby chippy, not with a far observatory", () => {
    const pairs = buildChains(POOL).map((c) => `${c.things[0].id}+${c.things[1].id}`);
    expect(pairs).toContain("beacon+chippy");
    expect(pairs.some((p) => p.includes("kielder"))).toBe(false);
  });

  it("prefers walk-then-meal over meal-then-walk", () => {
    const pairs = buildChains([BEACON_WALK, CHIPPY]).map((c) => `${c.things[0].id}+${c.things[1].id}`);
    expect(pairs).toEqual(["beacon+chippy"]);
  });
});

// New with the port: weights normalised on read, and the spec §7 terms.
describe("weights and the new terms", () => {
  const evening = win("2026-08-21", "18:30", "22:00");

  it("normalises slider values so they sum to one, ignoring negatives", () => {
    const w = normaliseWeights({ cost_fit: 2, taste: -1 });
    expect(Object.values(w).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
    expect(w.taste).toBe(0);
    expect(w.cost_fit).toBeGreaterThan(DEFAULT_WEIGHTS.cost_fit);
  });

  it("the same ranking whether the weights are given doubled or as they are", () => {
    const doubled = Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => [k, v * 2]));
    const a = scoreCandidate(cand([BEACON_WALK]), ctx(evening)).score;
    const b = scoreCandidate(cand([BEACON_WALK]), ctx(evening, { weights: doubled })).score;
    expect(b).toBe(a);
  });

  it("variety marks down a repeat of the last kind; waited grows to full at three months", () => {
    const recent = scoreCandidate(cand([BEACON_WALK]), ctx(evening, { recentKinds: ["walk", "food"] })).factors.variety;
    const other = scoreCandidate(cand([CHIPPY]), ctx(evening, { recentKinds: ["walk"] })).factors.variety;
    expect(recent).toBe(0);
    expect(other).toBe(1);
    const old = thing({ ...BEACON_WALK, created_at: "2026-04-01T00:00:00Z" });
    const fresh = thing({ ...BEACON_WALK, created_at: "2026-08-05T12:00:00Z" });
    expect(scoreCandidate(cand([old]), ctx(evening)).factors.waited).toBe(1);
    expect(scoreCandidate(cand([fresh]), ctx(evening)).factors.waited).toBeCloseTo(15 / 90, 5);
  });

  it("the new terms change nothing at their default weight of zero", () => {
    const plain = scoreCandidate(cand([BEACON_WALK]), ctx(evening)).score;
    const withTerms = scoreCandidate(cand([thing({ ...BEACON_WALK, created_at: "2026-01-01T00:00:00Z" })]), ctx(evening, { recentKinds: ["walk"] })).score;
    expect(withTerms).toBe(plain);
  });
});
