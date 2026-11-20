import { describe, expect, it } from "vitest";
import { daysInMonth, type MeasurePlan, measureRows, median, monthMeasures } from "./measures";
import { bannedIn } from "./words";

const at = (day: string, hhmm: string) => `${day}T${hhmm}:00Z`;

function day(d: number, items: Array<[state: string, started?: string | null, finished?: string | null]>, opts: { status?: string; accepted?: string | null } = {}): MeasurePlan {
  const dayStr = `2026-10-${String(d).padStart(2, "0")}`;
  return {
    day: dayStr,
    status: opts.status ?? "closed",
    proposed_at: at(dayStr, "07:00"),
    prompted_at: at(dayStr, "08:00"),
    accepted_at: opts.accepted === undefined ? at(dayStr, "08:30") : opts.accepted,
    items: items.map(([state, started, finished], i) => ({ is_win: i === 0, state, started_at: started ? at(dayStr, started) : null, finished_at: finished ? at(dayStr, finished) : null })),
  };
}

describe("the eight monthly measures (research §6)", () => {
  it("has nothing to say about a month with nothing in it, and says so with nulls rather than zeros", () => {
    const m = monthMeasures("2026-10", { plans: [], interruptions: [], closeouts: [], stuck: 0 });
    expect(m.win_rate).toBeNull();
    expect(m.start_latency_min).toBeNull();
    expect(m.finish_ratio).toBeNull();
    expect(m.plan_accuracy).toBeNull();
    expect(m.return_days).toBeNull();
    expect(m.nudge_response).toBeNull();
    expect(m.screen_minutes_per_week).toBeNull();
    expect(m.days_in_month).toBe(31);
    expect(measureRows(m, null).every((r) => r.now === "—" || r.key === "stuck")).toBe(true);
  });

  it("computes each measure from what happened", () => {
    const plans = [
      day(1, [["done", "08:40", "09:30"], ["done", "10:00", "10:20"], ["planned"]]),
      day(2, [["moved"], ["done", "09:00", "09:40"]]),
      day(3, [["started", "09:10"], ["planned"]]),
      // 4th and 5th: nothing finished
      day(5, [["planned"]]),
      day(6, [["good_enough", "08:50", "09:00"]]),
      // a proposed day never accepted: its items do not count towards plan accuracy
      day(7, [["planned"]], { status: "proposed", accepted: null }),
    ];
    const m = monthMeasures("2026-10", {
      plans,
      interruptions: [
        { at: at("2026-10-01", "12:00"), acted_at: at("2026-10-01", "12:10"), origin: "app", counted: true },
        { at: at("2026-10-02", "12:00"), acted_at: at("2026-10-02", "13:30"), origin: "app", counted: true },
        { at: at("2026-10-03", "12:00"), acted_at: null, origin: "app", counted: true },
        { at: at("2026-10-03", "12:00"), acted_at: at("2026-10-03", "12:01"), origin: "person", counted: false }, // a person's nudge: not the app's to measure
        { at: at("2026-09-30", "12:00"), acted_at: at("2026-09-30", "12:01"), origin: "app", counted: true }, // last month
      ],
      closeouts: [
        { week: "2026-W40", screen_minutes: 600, partner_answers: { helping: "Mostly", costing: "A bit" } },
        { week: "2026-W41", screen_minutes: 480, partner_answers: null },
        { week: "2026-W42", screen_minutes: null, partner_answers: null },
      ],
      stuck: 2,
    });
    // 1. win days: 1st, 6th → 2 over 31/7 weeks
    expect(m.win_rate).toBe(0.5);
    // 2. latency: 1st 10 min, 2nd 30 min, 3rd 40 min, 6th 20 min → median 25
    expect(m.start_latency_min).toBe(25);
    // 3. started: 1st two, 2nd one, 3rd one, 6th one = 5; finished 4
    expect(m.finish_ratio).toBe(0.8);
    expect(m.stuck_over_14_days).toBe(2);
    // 4. accepted-day items (not swapped, not the proposed day): 3+2+2+1+1 = 9; finished 4
    expect(m.plan_accuracy).toBe(0.44);
    // 5. active days 1, 2, 6 → gap of 3 days (3rd, 4th, 5th)
    expect(m.return_days).toBe(3);
    // 6. three app nudges this month, one within thirty minutes
    expect(m.nudge_response).toBe(0.33);
    // 7. two weeks typed in
    expect(m.screen_minutes_per_week).toBe(540);
    // 8. the latest answers
    expect(m.partner).toEqual({ helping: "Mostly", costing: "A bit" });
    expect(m.days_planned).toBe(6);
  });

  it("lays the month beside the one before, with the research's aims, in words the loop may use", () => {
    const cur = monthMeasures("2026-10", { plans: [day(1, [["done", "08:40", "09:30"]])], interruptions: [], closeouts: [{ week: "2026-W40", screen_minutes: 600, partner_answers: null }], stuck: 1 });
    const prev = monthMeasures("2026-09", { plans: [], interruptions: [], closeouts: [], stuck: 0 });
    const rows = measureRows(cur, prev);
    expect(rows.map((r) => r.key)).toEqual(["win_rate", "start_latency", "finish_ratio", "stuck", "plan_accuracy", "return_days", "nudge_response", "screen"]);
    expect(rows[0]).toEqual({ key: "win_rate", label: "Win days a week", now: "0.2", before: "—", aim: "4" });
    expect(rows[7].now).toBe("10 h");
    expect(rows[4].now).toBe("100%");
    for (const r of rows) for (const text of [r.label, r.aim]) expect(bannedIn(text), text).toBeNull();
  });

  it("has a median and a month length", () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([1, 5, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
  });
});
