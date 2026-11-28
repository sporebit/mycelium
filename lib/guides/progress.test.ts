import { describe, expect, it } from "vitest";
import type { StepsDefinition, StepsState } from "@/lib/tickets/steps";
import {
  correctionRatio,
  dayWords,
  flightPlan,
  freshness,
  guideSteps,
  nextStep,
  overall,
  phaseProgress,
  resumePoint,
  stepHistory,
  tomorrowLondon,
} from "./progress";

const def: StepsDefinition = {
  format: "field-guide",
  toggles: { platform: { label: "Platform", options: { win: "Windows", mac: "Mac" }, default: "win" } },
  phases: [
    {
      id: "1",
      title: "First",
      steps: [
        { id: "1.1", title: "A", actor: "you", minutes: 5 },
        { id: "1.2", title: "B", actor: "you", minutes: 5 },
      ],
    },
    {
      id: "2",
      title: "Second",
      minutes: 10,
      needs: ["IONOS login"],
      hard_part: "The forward",
      steps: [
        { id: "2.1", title: "C", actor: "you", minutes: 4 },
        { id: "2.2", title: "D on Mac", actor: "you", minutes: 4, platforms: ["mac"] },
        { id: "2.3", title: "E", actor: "you", minutes: 6 },
      ],
    },
    { id: "3", title: "Third", steps: [{ id: "3.1", title: "F", actor: "you", minutes: 8 }] },
    { id: "4", title: "Empty on Windows", steps: [{ id: "4.1", title: "Mac only", platforms: ["mac"] }] },
  ],
};

const empty = (): StepsState => ({ toggles: {}, steps: {}, answers: {} });
const tick = (at: string) => ({ done: true, at });

describe("phaseProgress", () => {
  it("hides steps for another platform and drops phases left empty", () => {
    const p = phaseProgress(def, empty());
    expect(p.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(p[1].total).toBe(2);
    expect(guideSteps(def.phases[1], { platform: "mac" }, def)).toHaveLength(3);
  });

  it("opens exactly one phase: the first with an unticked step", () => {
    const s = empty();
    s.steps["1.1"] = tick("2026-11-27T20:00:00Z");
    s.steps["1.2"] = tick("2026-11-27T20:12:00Z");
    const p = phaseProgress(def, s);
    expect(p.map((x) => x.state)).toEqual(["done", "open", "later"]);
    expect(p[0].minutes_actual).toBe(12);
    expect(p[0].minutes_est).toBe(10);
    expect(p[1].minutes_est).toBe(10); // the phase's own figure wins
  });

  it("has no open phase once everything is ticked", () => {
    const s = empty();
    for (const id of ["1.1", "1.2", "2.1", "2.3", "3.1"]) s.steps[id] = tick("2026-11-27T20:00:00Z");
    expect(phaseProgress(def, s).every((x) => x.state === "done")).toBe(true);
    expect(nextStep(def, s)).toBeNull();
    expect(overall(def, s).pct).toBe(100);
  });
});

describe("D14: estimates correct themselves", () => {
  it("is 1 with nothing finished", () => {
    expect(correctionRatio(phaseProgress(def, empty()))).toBe(1);
  });

  it("scales what is left by actual over estimated", () => {
    const s = empty();
    s.steps["1.1"] = tick("2026-11-27T20:00:00Z");
    s.steps["1.2"] = tick("2026-11-27T20:15:00Z"); // 15 actual against 10 estimated
    const p = phaseProgress(def, s);
    expect(correctionRatio(p)).toBe(1.5);
    // left: phase 2 (10) + phase 3 (8) = 18, times 1.5
    expect(overall(def, s, p).minutes_left_est).toBe(27);
  });

  it("clamps between 0.5 and 3", () => {
    const slow = empty();
    slow.steps["1.1"] = tick("2026-11-27T20:00:00Z");
    slow.steps["1.2"] = tick("2026-11-27T22:00:00Z");
    expect(correctionRatio(phaseProgress(def, slow))).toBe(3);
    const fast = empty();
    fast.steps["1.1"] = tick("2026-11-27T20:00:00Z");
    fast.steps["1.2"] = tick("2026-11-27T20:01:00Z");
    expect(correctionRatio(phaseProgress(def, fast))).toBe(0.5);
  });

  it("the flight plan shows corrected minutes for what is not finished", () => {
    const s = empty();
    s.steps["1.1"] = tick("2026-11-27T20:00:00Z");
    s.steps["1.2"] = tick("2026-11-27T20:20:00Z"); // ratio 2
    const plan = flightPlan(def, s);
    expect(plan.rows.map((r) => r.minutes)).toEqual([20, 20, 16]);
    expect(plan.rows[1]).toMatchObject({ needs: ["IONOS login"], hard_part: "The forward", corrected: true, state: "open" });
    expect(plan.summary).toBe("3 sittings, about 56 minutes");
  });
});

describe("resumePoint", () => {
  const now = new Date("2026-11-28T10:00:00Z");

  it("is null with nothing ticked", () => {
    expect(resumePoint(def, empty(), now)).toBeNull();
  });

  it("names the newest tick and the next step", () => {
    const s = empty();
    s.steps["1.1"] = tick("2026-11-27T21:30:00Z");
    s.steps["1.2"] = tick("2026-11-27T21:40:00Z");
    const r = resumePoint(def, s, now)!;
    expect(r.last.id).toBe("1.2");
    expect(r.next).toMatchObject({ id: "2.1", phase_id: "2" });
    expect(r.line).toBe("Where you were: ticked 1.2 at 21:40 yesterday. Next: 2.1 C.");
  });

  it("is null when everything is ticked", () => {
    const s = empty();
    for (const id of ["1.1", "1.2", "2.1", "2.3", "3.1"]) s.steps[id] = tick("2026-11-27T20:00:00Z");
    expect(resumePoint(def, s, now)).toBeNull();
  });
});

describe("words for days", () => {
  const now = new Date("2026-11-28T10:00:00Z"); // a Saturday
  it("says today, yesterday, a weekday, then a date, in London", () => {
    expect(dayWords("2026-11-28T08:00:00Z", now)).toBe("today");
    expect(dayWords("2026-11-27T23:30:00Z", now)).toBe("yesterday");
    expect(dayWords("2026-11-26T12:00:00Z", now)).toBe("on Thursday");
    expect(dayWords("2026-11-12T12:00:00Z", now)).toBe("on 12 Nov");
  });
  it("puts tomorrow in London", () => {
    expect(tomorrowLondon(new Date("2026-11-28T23:30:00Z"))).toBe("2026-11-29");
    expect(tomorrowLondon(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-02"); // BST: already 1 July in London
  });
});

describe("freshness", () => {
  it("is unknown with no date, fresh inside six months, amber after", () => {
    expect(freshness(def, "2026-11-28")).toBe("unknown");
    expect(freshness({ ...def, intro: { last_verified: "2026-06-01" } }, "2026-11-28")).toBe("fresh");
    expect(freshness({ ...def, intro: { last_verified: "2026-05-28" } }, "2026-11-28")).toBe("amber");
    expect(freshness({ ...def, intro: { last_verified: "2026-05-29" } }, "2026-11-28")).toBe("fresh");
  });
});

describe("stepHistory", () => {
  it("keeps a failure as history after the tick", () => {
    const s = empty();
    s.failures = { "1.1": { at: "2026-11-28T14:02:00Z", note: "403" } };
    expect(stepHistory(s, "1.1")).toBe("did not work at 14:02");
    s.steps["1.1"] = tick("2026-11-28T14:20:00Z");
    expect(stepHistory(s, "1.1")).toBe("did not work at 14:02, then done at 14:20");
    expect(stepHistory(s, "1.2")).toBeNull();
  });
});
