import { describe, expect, it } from "vitest";
import { mergeState, normaliseState, type StepsState } from "./steps";

const now = new Date("2026-11-28T14:02:00Z");
const base = (): StepsState => ({ toggles: { shell: "bash" }, steps: { "1.1": { done: true, at: "2026-11-27T10:00:00Z" } }, answers: { a: "x" } });

describe("normaliseState", () => {
  it("keeps the three original keys and adds nothing to an old state", () => {
    expect(normaliseState({ steps: { "1.1": { done: true, at: "t" } } })).toEqual({ toggles: {}, steps: { "1.1": { done: true, at: "t" } }, answers: {} });
    expect(normaliseState(null)).toEqual({ toggles: {}, steps: {}, answers: {} });
  });
  it("carries failures and park when present", () => {
    const s = normaliseState({ failures: { "1.2": { at: "t", note: "n" } }, park: { at: "t", step_id: "1.2", note: "tea" } });
    expect(s.failures).toEqual({ "1.2": { at: "t", note: "n" } });
    expect(s.park).toEqual({ at: "t", step_id: "1.2", note: "tea" });
  });
});

describe("mergeState", () => {
  it("still ticks, unticks, answers and toggles as before", () => {
    const s = mergeState(base(), { steps: { "1.2": true, "1.1": null }, answers: { a: null, b: "y" }, toggles: { shell: "powershell" } }, now);
    expect(s).toEqual({ toggles: { shell: "powershell" }, steps: { "1.2": { done: true, at: now.toISOString() } }, answers: { b: "y" } });
  });

  it("records a failure with its time, and null clears it", () => {
    const s = mergeState(base(), { failures: { "1.2": { note: "403 from the API" } } }, now);
    expect(s.failures).toEqual({ "1.2": { at: now.toISOString(), note: "403 from the API" } });
    const cleared = mergeState(s, { failures: { "1.2": null } }, now);
    expect(cleared.failures).toBeUndefined();
  });

  it("keeps a failure when the step is later ticked", () => {
    const failed = mergeState(base(), { failures: { "1.2": { note: "no" } } }, now);
    const ticked = mergeState(failed, { steps: { "1.2": true } }, new Date("2026-11-28T14:20:00Z"));
    expect(ticked.failures?.["1.2"].note).toBe("no");
    expect(ticked.steps["1.2"].done).toBe(true);
  });

  it("parks with a time and null unparks", () => {
    const parked = mergeState(base(), { park: { step_id: "2.4", note: "out of time" } }, now);
    expect(parked.park).toEqual({ at: now.toISOString(), step_id: "2.4", note: "out of time" });
    expect(parked.steps["1.1"].done).toBe(true);
    const back = mergeState(parked, { park: null }, now);
    expect(back.park).toBeUndefined();
  });

  it("leaves park alone when the patch does not mention it", () => {
    const parked = mergeState(base(), { park: { step_id: "2.4", note: "x" } }, now);
    expect(mergeState(parked, { steps: { "2.4": true } }, now).park?.step_id).toBe("2.4");
  });
});
