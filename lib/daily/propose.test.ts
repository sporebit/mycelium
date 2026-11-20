import { describe, expect, it } from "vitest";
import { type Candidate, daysBetween, freeMinutesFor, propose, score, shownMinutes, slippedDays, swapOptions } from "./propose";

const DAY = "2026-11-20"; // a Friday

let n = 0;
function c(over: Partial<Candidate> & { title: string }): Candidate {
  n += 1;
  return {
    id: over.id ?? `t${n}`,
    key: `MYC-${n}`,
    category: "next",
    scheduled_on: null,
    deadline_on: null,
    urgent: false,
    points: null,
    time_estimate_min: null,
    priority_score: 0.5,
    now_score: null,
    someday: false,
    blocked: false,
    progress: null,
    next_step: null,
    project_name: null,
    slip_offered: false,
    ...over,
  };
}

describe("shownMinutes — the guess × 1.5 (research rule 9)", () => {
  it("multiplies and rounds to five", () => {
    expect(shownMinutes(20)).toBe(30);
    expect(shownMinutes(10)).toBe(15);
    expect(shownMinutes(45)).toBe(70);
  });
  it("treats no estimate as a half-hour guess", () => {
    expect(shownMinutes(null)).toBe(45);
    expect(shownMinutes(0)).toBe(45);
  });
  it("never shows less than five minutes", () => {
    expect(shownMinutes(1)).toBe(5);
  });
});

describe("dates", () => {
  it("counts days between two dates", () => {
    expect(daysBetween("2026-11-20", "2026-11-23")).toBe(3);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3); // across the clock change
  });
  it("says how long ago a ticket's date passed", () => {
    expect(slippedDays(c({ title: "a", scheduled_on: "2026-11-13" }), DAY)).toBe(7);
    expect(slippedDays(c({ title: "b", deadline_on: DAY }), DAY)).toBe(0);
    expect(slippedDays(c({ title: "c", scheduled_on: "2026-11-25" }), DAY)).toBe(-1);
    expect(slippedDays(c({ title: "d" }), DAY)).toBe(-1);
  });
});

describe("propose", () => {
  it("puts the thing whose date is today first and marks it as the win", () => {
    const due = c({ title: "Boiler quote", deadline_on: DAY, time_estimate_min: 20 });
    const p = propose({ day: DAY, freeMinutes: 360, candidates: [c({ title: "Tidy the shed" }), due, c({ title: "Read the article" })] });
    expect(p.items[0]).toMatchObject({ ticket_id: due.id, position: 1, is_win: true, shown_minutes: 30, why: "Its date is today" });
    expect(p.items.filter((i) => i.is_win)).toHaveLength(1);
  });

  it("holds at most five", () => {
    const many = Array.from({ length: 12 }, (_, i) => c({ title: `Small ${i}`, time_estimate_min: 5 }));
    const p = propose({ day: DAY, freeMinutes: 600, candidates: many });
    expect(p.items).toHaveLength(5);
    expect(p.items.map((i) => i.position)).toEqual([1, 2, 3, 4, 5]);
    expect(p.bench).toHaveLength(7);
  });

  it("keeps the extras inside half the day's free time, apart from five-minute things", () => {
    const win = c({ title: "The win", deadline_on: DAY, time_estimate_min: 40 }); // shown 60
    const big = c({ title: "Big extra", scheduled_on: DAY, time_estimate_min: 60 }); // shown 90: does not fit
    const fits = c({ title: "Fits", urgent: true, time_estimate_min: 20 }); // shown 30
    const tiny = c({ title: "Tiny", time_estimate_min: 10 }); // shown 15
    const p = propose({ day: DAY, freeMinutes: 180, candidates: [win, big, fits, tiny] }); // budget 90
    const ids = p.items.map((i) => i.ticket_id);
    expect(ids).toEqual([win.id, fits.id, tiny.id]);
    expect(ids).not.toContain(big.id);
    expect(p.budget_minutes).toBe(90);
    expect(p.bench).toContain(big.id);
  });

  it("still names a win when the day has no free time at all", () => {
    const only = c({ title: "The one thing", deadline_on: DAY, time_estimate_min: 30 });
    const p = propose({ day: DAY, freeMinutes: 0, candidates: [only, c({ title: "Something else", time_estimate_min: 60 })] });
    expect(p.items.map((i) => i.ticket_id)).toEqual([only.id]);
  });

  it("prefers a win that can be finished today over a slightly stronger one that cannot", () => {
    const huge = c({ title: "Rewire the house", scheduled_on: DAY, urgent: true, time_estimate_min: 480 });
    const doable = c({ title: "Order the hinges", scheduled_on: DAY, category: "doing", time_estimate_min: 15 });
    const p = propose({ day: DAY, freeMinutes: 180, candidates: [huge, doable] });
    expect(p.items[0].ticket_id).toBe(doable.id);
  });

  it("favours what is already started and what is nearly finished", () => {
    const started = c({ title: "Started", category: "doing" });
    const nearly = c({ title: "Nearly done", category: "doing", progress: 0.85 });
    const fresh = c({ title: "Fresh", category: "next", priority_score: 0.9 });
    const p = propose({ day: DAY, freeMinutes: 600, candidates: [fresh, started, nearly] });
    expect(p.items.map((i) => i.ticket_id)).toEqual([nearly.id, started.id, fresh.id]);
    expect(p.items[0].why).toBe("Already started");
  });

  it("leaves out someday, blocked, waiting and anything the person said 'not now' to", () => {
    const keep = c({ title: "Keep" });
    const not = c({ title: "Not now" });
    const p = propose({
      day: DAY,
      freeMinutes: 600,
      exclude: [not.id],
      candidates: [keep, not, c({ title: "Someday", someday: true }), c({ title: "Blocked", blocked: true }), c({ title: "Waiting", category: "waiting" }), c({ title: "Done", category: "done" })],
    });
    expect(p.items.map((i) => i.ticket_id)).toEqual([keep.id]);
  });

  it("does not put a week-old date back at the front: it is held for one decision card (rule 14)", () => {
    const stale = c({ title: "Renew the passport", scheduled_on: "2026-11-10" }); // 10 days
    const offered = c({ title: "Already offered", scheduled_on: "2026-11-01", slip_offered: true });
    const recent = c({ title: "Slipped two days", scheduled_on: "2026-11-18" });
    const p = propose({ day: DAY, freeMinutes: 600, candidates: [stale, offered, recent] });
    expect(p.items.map((i) => i.ticket_id)).toEqual([recent.id]);
    expect(p.slipped).toEqual([stale.id]);
    expect(p.bench).not.toContain(stale.id);
    expect(p.bench).not.toContain(offered.id);
  });

  it("keeps something in progress in play however old its date is", () => {
    const working = c({ title: "Half-built shed", category: "doing", scheduled_on: "2026-10-01" });
    const p = propose({ day: DAY, freeMinutes: 600, candidates: [working] });
    expect(p.items[0].ticket_id).toBe(working.id);
    expect(p.slipped).toEqual([]);
  });

  it("gives an empty plan when there is nothing to do, without failing", () => {
    const p = propose({ day: DAY, freeMinutes: 300, candidates: [] });
    expect(p.items).toEqual([]);
    expect(p.planned_minutes).toBe(0);
  });

  it("is deterministic: the same tickets give the same plan", () => {
    const set = [c({ title: "B" }), c({ title: "A" }), c({ title: "C", urgent: true })];
    const a = propose({ day: DAY, freeMinutes: 300, candidates: set });
    const b = propose({ day: DAY, freeMinutes: 300, candidates: [...set].reverse() });
    expect(a.items.map((i) => i.ticket_id)).toEqual(b.items.map((i) => i.ticket_id));
  });

  it("offers two alternatives for a swap", () => {
    const many = Array.from({ length: 9 }, (_, i) => c({ title: `Item ${i}`, time_estimate_min: 5 }));
    const p = propose({ day: DAY, freeMinutes: 600, candidates: many });
    expect(swapOptions(p)).toHaveLength(2);
    expect(p.items.map((i) => i.ticket_id)).not.toContain(swapOptions(p)[0]);
  });
});

describe("the words on a card", () => {
  it("never says overdue, missed or late", () => {
    const reasons = [
      score(c({ title: "a", deadline_on: "2026-11-01" }), DAY).why,
      score(c({ title: "b", scheduled_on: "2026-11-18" }), DAY).why,
      score(c({ title: "c", deadline_on: DAY }), DAY).why,
      score(c({ title: "d" }), DAY).why,
    ];
    for (const r of reasons) expect(r).not.toMatch(/overdue|missed|late|fail|still haven|should|must/i);
  });
});

describe("freeMinutesFor", () => {
  it("uses the defaults and lets a setting override a day", () => {
    expect(freeMinutesFor(1)).toBe(180);
    expect(freeMinutesFor(5)).toBe(360);
    expect(freeMinutesFor(1, { 1: 60 })).toBe(60);
    expect(freeMinutesFor(2, { 1: 60 })).toBe(180);
    expect(freeMinutesFor(3, { 3: 0 })).toBe(0);
  });
});
