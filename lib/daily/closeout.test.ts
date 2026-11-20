import { describe, expect, it } from "vitest";
import { boxLeft, type FillPlan, firstWeekOfMonth, lifetimeTotals, minutesToCloseout, monthOfWeek, previousMonth, previousWeek, weekDays, weekFill, weekKey } from "./closeout";
import { fillLine, lifetimeLine } from "./words";

const plan = (day: string, states: string[], status = "closed"): FillPlan => ({ day, status, items: states.map((state, i) => ({ is_win: i === 0, state, position: i })) });

describe("the week's arithmetic (research rule 25)", () => {
  it("knows which ISO week a day is in and the seven days of that week", () => {
    expect(weekKey("2026-11-20")).toBe("2026-W47");
    expect(weekKey("2026-11-22")).toBe("2026-W47"); // Sunday closes the same week
    expect(weekKey("2026-11-23")).toBe("2026-W48");
    expect(weekKey("2027-01-01")).toBe("2026-W53");
    expect(weekDays("2026-11-20")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(previousWeek("2026-W47")).toBe("2026-W46");
    expect(previousWeek("2027-W01")).toBe("2026-W53");
  });

  it("counts the week's fill: win days, finished of started, nothing about what was not done", () => {
    const fill = weekFill("2026-W47", [
      plan("2026-11-16", ["done", "started", "planned"]),
      plan("2026-11-17", ["moved", "done"]),
      plan("2026-11-18", ["good_enough", "dropped", "swapped"]),
      plan("2026-11-23", ["done"]), // next week: not counted
    ]);
    expect(fill).toEqual({ week: "2026-W47", win_days: 2, finished: 3, started: 4, planned: 7, dropped: 1, days_planned: 3 });
    expect(fillLine(fill)).toBe("2 win days. 3 finished of 4 started.");
    expect(fillLine({ win_days: 0, finished: 0, started: 0 })).toBe("0 win days. Nothing started yet this week.");
  });

  it("keeps lifetime totals that only grow and never reads as a streak", () => {
    const totals = lifetimeTotals([plan("2026-01-01", ["done"]), plan("2026-01-05", ["moved"]), plan("2026-01-09", ["done", "done"])], 12);
    expect(totals).toEqual({ win_days: 2, finished: 3, weeks_closed: 12, days: 3 });
    expect(lifetimeLine(totals)).toBe("2 win days, 3 things finished, 12 weeks closed.");
    expect(lifetimeLine({ win_days: 1, finished: 1, weeks_closed: 1 })).toBe("1 win day, 1 thing finished, 1 week closed.");
    expect(lifetimeLine({ win_days: 212, finished: 1480, weeks_closed: 51 })).toBe("212 win days, 1,480 things finished, 51 weeks closed.");
  });

  it("knows the month a week belongs to and whether a week is the first of its month", () => {
    expect(monthOfWeek("2026-W47")).toBe("2026-11");
    expect(monthOfWeek("2026-W49")).toBe("2026-12"); // Thursday 3 December
    expect(monthOfWeek("2026-W44")).toBe("2026-10"); // Thursday 29 October
    expect(monthOfWeek("2026-W45")).toBe("2026-11"); // Thursday 5 November
    expect(firstWeekOfMonth("2026-W45")).toBe(true);
    expect(firstWeekOfMonth("2026-W46")).toBe(false);
    expect(firstWeekOfMonth("2026-W49")).toBe(true);
    expect(previousMonth("2026-11")).toBe("2026-10");
    expect(previousMonth("2026-01")).toBe("2025-12");
  });

  it("knows how long until the slot and how much of the box is left", () => {
    expect(minutesToCloseout(7, 17 * 60 + 50, 7, "18:00")).toBe(10);
    expect(minutesToCloseout(6, 17 * 60 + 50, 7, "18:00")).toBeNull();
    expect(minutesToCloseout(7, 18 * 60 + 1, 7, "18:00")).toBeNull();
    const started = new Date("2026-11-22T18:00:00Z");
    expect(boxLeft(started.toISOString(), 45, new Date("2026-11-22T18:10:00Z"))).toBe(35);
    expect(boxLeft(started.toISOString(), 45, new Date("2026-11-22T19:00:00Z"))).toBe(0);
    expect(boxLeft(null, 45, started)).toBeNull();
  });
});
