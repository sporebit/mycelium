import { describe, expect, it } from "vitest";
import { learnTagWeights, untriedTags, weeklyStreak, type EngineMemory } from "./preferences";

function mem(partial: Partial<EngineMemory> & { done_on: string; tags: string[] }): EngineMemory {
  return { rating_by: {}, again_by: {}, ...partial };
}

const now = Date.parse("2026-09-01T12:00:00Z");

describe("learnTagWeights", () => {
  it("returns nothing with no memories", () => {
    expect(learnTagWeights([], "kirsty", now)).toEqual({});
  });

  it("five stars pushes a tag up, one star pushes it down", () => {
    const w = learnTagWeights(
      [
        mem({ done_on: "2026-08-20", tags: ["outdoors"], rating_by: { kirsty: 5 } }),
        mem({ done_on: "2026-08-21", tags: ["indoors"], rating_by: { kirsty: 1 } }),
      ],
      "kirsty",
      now,
    );
    expect(w.outdoors).toBeGreaterThan(0.7);
    expect(w.indoors).toBeLessThan(0.3);
  });

  it("the other person's rating doesn't leak into mine", () => {
    const w = learnTagWeights([mem({ done_on: "2026-08-20", tags: ["outdoors"], rating_by: { phil: 5 } })], "kirsty", now);
    // Only the implicit "done once" signal, which is neutral.
    expect(w.outdoors).toBe(0.5);
  });

  it("'again?' works on its own", () => {
    const love = learnTagWeights([mem({ done_on: "2026-08-20", tags: ["coast"], again_by: { kirsty: "love" } })], "kirsty", now);
    const meh = learnTagWeights([mem({ done_on: "2026-08-20", tags: ["coast"], again_by: { kirsty: "meh" } })], "kirsty", now);
    expect(love.coast).toBeGreaterThan(meh.coast);
  });

  it("repeats without ratings nudge upward", () => {
    const w = learnTagWeights([1, 2, 3, 4].map((i) => mem({ done_on: `2026-08-0${i}`, tags: ["faith"] })), "phil", now);
    expect(w.faith).toBeGreaterThan(0.5);
    expect(w.faith).toBeLessThanOrEqual(1);
  });

  it("old ratings count for less than recent ones", () => {
    const recentBad = learnTagWeights(
      [
        mem({ done_on: "2024-01-01", tags: ["hills"], rating_by: { phil: 5 } }),
        mem({ done_on: "2026-08-25", tags: ["hills"], rating_by: { phil: 1 } }),
      ],
      "phil",
      now,
    );
    expect(recentBad.hills).toBeLessThan(0.4);
  });

  it("stays within 0..1", () => {
    const w = learnTagWeights([mem({ done_on: "2026-08-20", tags: ["x"], rating_by: { phil: 5 }, again_by: { phil: "love" } })], "phil", now);
    expect(w.x).toBeLessThanOrEqual(1);
  });
});

describe("untriedTags", () => {
  it("lists tags in the pool with no memory", () => {
    const ms = [mem({ done_on: "2026-08-20", tags: ["outdoors", "food"] })];
    expect(untriedTags(ms, ["outdoors", "food", "night-sky", "romance", "night-sky"])).toEqual(["night-sky", "romance"]);
  });
});

describe("weeklyStreak", () => {
  it("counts consecutive weeks ending now", () => {
    // 1 Sep 2026 is a Tuesday; the week starts Mon 31 Aug.
    const ms = [
      mem({ done_on: "2026-08-31", tags: [] }),
      mem({ done_on: "2026-08-26", tags: [] }),
      mem({ done_on: "2026-08-18", tags: [] }),
      mem({ done_on: "2026-08-01", tags: [] }), // gap before this
    ];
    expect(weeklyStreak(ms, now)).toBe(3);
  });
  it("is zero when this week has nothing", () => {
    expect(weeklyStreak([mem({ done_on: "2026-08-10", tags: [] })], now)).toBe(0);
  });
});
