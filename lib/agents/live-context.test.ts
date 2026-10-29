import { describe, expect, it } from "vitest";
import { formatFitnessContext, formatNutritionContext, phaseWeekLabel } from "./live-context";

describe("phaseWeekLabel", () => {
  it("counts the week within the phase", () => {
    expect(phaseWeekLabel("2026-W40", "2026-W45", "2026-W42")).toBe("week 3 of 6");
    expect(phaseWeekLabel("2026-W40", null, "2026-W40")).toBe("week 1");
  });
  it("gives up on an unparseable week", () => {
    expect(phaseWeekLabel("nope", "2026-W45", "2026-W42")).toBeNull();
  });
});

describe("formatFitnessContext", () => {
  it("writes the full block", () => {
    const text = formatFitnessContext({
      today: "2026-10-29",
      programme: { name: "PTP block 2", week: "week 3 of 6", phase: "2026-W40 → 2026-W45" },
      plannedToday: [{ name: "Upper A", slot: "am", kind: "strength" }],
      recentSessions: [{ date: "2026-10-28", name: "Lower A", kind: "strength", status: "completed" }],
      recentPain: [{ date: "2026-10-27", exercise: "Back squat", severity: 4, feel: "mild", regions: ["knee_l"] }],
    });
    expect(text).toBe(
      [
        "Live fitness context (as of 2026-10-29):",
        "- Programme: PTP block 2, week 3 of 6 (phase 2026-W40 → 2026-W45).",
        "- Today's plan: Upper A (am, strength).",
        "- Last 7 days: 1 session — 2026-10-28 Lower A (completed).",
        "- Pain, last 14 days: 2026-10-27 Back squat — 4/10, knee_l.",
      ].join("\n"),
    );
  });
  it("says so when there is nothing", () => {
    const text = formatFitnessContext({ today: "2026-10-29", programme: null, plannedToday: [], recentSessions: [], recentPain: [] });
    expect(text).toContain("none active this week");
    expect(text).toContain("rest day");
    expect(text).toContain("no sessions logged");
    expect(text).toContain("none logged");
  });
});

describe("formatNutritionContext", () => {
  const targets = { kcal: 2400, protein: 180, fat: 80, carbs: 260, effective_from: "2026-09-01", review_on: "2026-11-01", is_versioned: true };
  it("writes the full block", () => {
    const text = formatNutritionContext({
      today: "2026-10-29",
      targets,
      todayTotals: { kcal: 1240.4, protein: 95, fat: 40, carbs: 120, fibre: 12, logs: 3 },
      weekAverage: { kcal: 2180, protein: 160, days: 6 },
      recentGut: [{ date: "2026-10-28", bristol: 4, discomfort: true, blood: false, urgent: null }],
      recipes: { count: 42, latest: ["Dal", "Katsu"] },
    });
    expect(text).toBe(
      [
        "Live nutrition context (as of 2026-10-29):",
        "- Targets: 2400 kcal, 180 g protein, 80 g fat, 260 g carbs (set 2026-09-01; review 2026-11-01).",
        "- Today so far: 1240 kcal, 95 g protein, 40 g fat, 120 g carbs, 12 g fibre (3 logs).",
        "- Last 7 days: average 2180 kcal and 160 g protein over 6 logged days.",
        "- Gut, last 7 days: 2026-10-28 Bristol 4 (discomfort).",
        "- Recipe library: 42 recipes; latest: Dal, Katsu.",
      ].join("\n"),
    );
  });
  it("flags default targets and empty days", () => {
    const text = formatNutritionContext({
      today: "2026-10-29",
      targets: { ...targets, is_versioned: false, effective_from: null, review_on: null },
      todayTotals: { kcal: 0, protein: 0, fat: 0, carbs: 0, fibre: 0, logs: 0 },
      weekAverage: null,
      recentGut: [],
      recipes: { count: 0, latest: [] },
    });
    expect(text).toContain("app defaults — no plan set");
    expect(text).toContain("Today so far: nothing logged");
    expect(text).toContain("Last 7 days: nothing logged");
    expect(text).toContain("Recipe library: empty");
  });
});
