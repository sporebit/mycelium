import { describe, expect, it } from "vitest";
import { type Feature, FEATURES, featureStates, featureTables, goneQuiet, howLong, quietHrefs, quietQuestion } from "./features";

const NOW = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const F: Feature[] = [
  { key: "daily", label: "Day log", href: "/journal", tables: ["a", "b"], quietAfterDays: 4 },
  { key: "monthly", label: "Receipts", href: "/receipts", tables: ["c"], quietAfterDays: 42 },
  { key: "never", label: "Places", href: "/places", tables: ["d"], quietAfterDays: 120 },
];

describe("how long", () => {
  it("days, then weeks, then months, then years", () => {
    expect(howLong(0)).toBe("1 day");
    expect(howLong(5)).toBe("5 days");
    expect(howLong(13)).toBe("13 days");
    expect(howLong(14)).toBe("2 weeks");
    expect(howLong(63)).toBe("9 weeks");
    expect(howLong(70)).toBe("2 months");
    expect(howLong(400)).toBe("13 months");
    expect(howLong(800)).toBe("2 years");
  });
});

describe("feature states", () => {
  it("a feature is as recent as its most recently written table", () => {
    const s = featureStates({ a: daysAgo(30), b: daysAgo(1), c: daysAgo(10) }, NOW, F);
    expect(s[0]).toMatchObject({ key: "daily", state: "active", days_quiet: 1, how_long: null });
    expect(s[1]).toMatchObject({ key: "monthly", state: "active", days_quiet: 10 });
  });

  it("each has its own rhythm: four days is quiet for a daily thing and nothing for a monthly one", () => {
    const s = featureStates({ a: daysAgo(4), c: daysAgo(4) }, NOW, F);
    expect(s[0]).toMatchObject({ state: "quiet", how_long: "4 days" });
    expect(s[1]).toMatchObject({ state: "active" });
    expect(featureStates({ c: daysAgo(42) }, NOW, F)[1]).toMatchObject({ state: "quiet", how_long: "6 weeks" });
    expect(featureStates({ c: daysAgo(41) }, NOW, F)[1].state).toBe("active");
  });

  it("never used is not the same as gone quiet", () => {
    const s = featureStates({ a: daysAgo(1), d: null }, NOW, F);
    expect(s[2]).toMatchObject({ state: "unused", last_at: null, days_quiet: null, how_long: null });
    expect(goneQuiet(s)).toEqual([]);
  });

  it("a timestamp in the future (a clock that was wrong) counts as today, not as negative days", () => {
    expect(featureStates({ a: new Date(NOW.getTime() + 86_400_000).toISOString() }, NOW, F)[0]).toMatchObject({ state: "active", days_quiet: 0 });
  });
});

describe("gone quiet", () => {
  it("orders by how far past its own rhythm, not by days alone", () => {
    // Day log: 21 days against 4 (5.25×). Receipts: 63 days against 42 (1.5×).
    const s = featureStates({ a: daysAgo(21), c: daysAgo(63) }, NOW, F);
    expect(goneQuiet(s).map((x) => x.key)).toEqual(["daily", "monthly"]);
    expect(quietHrefs(s)).toEqual(["/journal", "/receipts"]);
  });

  it("asks one direct question about the biggest gap, and nothing when all is in use", () => {
    const s = featureStates({ a: daysAgo(21), c: daysAgo(63) }, NOW, F);
    expect(quietQuestion(s)).toBe("Day log has not been touched for 3 weeks. Why? Keep it, pause it, or retire it.");
    expect(quietQuestion(featureStates({ a: daysAgo(0), c: daysAgo(1) }, NOW, F))).toBeNull();
  });
});

describe("the real list", () => {
  it("every feature has a place, at least one table and a sensible rhythm; keys and places are unique", () => {
    expect(new Set(FEATURES.map((f) => f.key)).size).toBe(FEATURES.length);
    expect(new Set(FEATURES.map((f) => f.href)).size).toBe(FEATURES.length);
    for (const f of FEATURES) {
      expect(f.href.startsWith("/"), f.key).toBe(true);
      expect(f.tables.length, f.key).toBeGreaterThan(0);
      expect(f.quietAfterDays, f.key).toBeGreaterThanOrEqual(3);
    }
  });

  it("reads no table twice and none that a sync or an import writes", () => {
    const tables = featureTables();
    expect(new Set(tables).size).toBe(tables.length);
    for (const machineWritten of ["gousto_recipes", "transactions", "health_workouts", "health_metrics", "pc_metrics", "spotify_plays", "api_usage", "audit_log"]) {
      expect(tables, machineWritten).not.toContain(machineWritten);
    }
  });
});
