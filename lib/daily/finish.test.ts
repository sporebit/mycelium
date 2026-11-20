import { describe, expect, it } from "vitest";
import { closeness, type FinishCandidate, finishLine } from "./finish";
import { bannedIn } from "./words";

const NOW = new Date("2026-11-20T12:00:00Z");
const c = (over: Partial<FinishCandidate> & { id: string }): FinishCandidate => ({
  key: `MYC-${over.id}`,
  title: `Ticket ${over.id}`,
  category: "doing",
  next_step: null,
  parked_note: null,
  steps: null,
  subtasks: null,
  updated_at: "2026-11-19T12:00:00Z",
  ...over,
});

describe("closeness", () => {
  it("a checklist at 80% or more is nearly done, and says what is left", () => {
    expect(closeness({ category: "doing", steps: { done: 8, total: 10 }, subtasks: null })).toEqual({ ratio: 0.8, left: "2 steps left of 10." });
    expect(closeness({ category: "doing", steps: { done: 9, total: 10 }, subtasks: null })).toEqual({ ratio: 0.9, left: "1 step left of 10." });
    expect(closeness({ category: "doing", steps: { done: 7, total: 10 }, subtasks: null })).toBeNull();
  });

  it("sub-tasks count the same way", () => {
    expect(closeness({ category: "next", steps: null, subtasks: { done: 4, total: 5 } })).toEqual({ ratio: 0.8, left: "1 sub-task left of 5." });
    expect(closeness({ category: "next", steps: null, subtasks: { done: 2, total: 5 } })).toBeNull();
  });

  it("everything ticked but not closed: closing is all that is left", () => {
    expect(closeness({ category: "doing", steps: { done: 6, total: 6 }, subtasks: null })).toEqual({ ratio: 1, left: "Every step is done. Closing it is all that is left." });
  });

  it("nothing to measure is not nearly done", () => {
    expect(closeness({ category: "doing", steps: null, subtasks: null })).toBeNull();
    expect(closeness({ category: "doing", steps: { done: 1, total: 1 }, subtasks: null }), "a single step is not a measure").toBeNull();
  });

  it("with both, the less finished part is what is left; one part far from done rules it out", () => {
    expect(closeness({ category: "doing", steps: { done: 10, total: 10 }, subtasks: { done: 4, total: 5 } })).toEqual({ ratio: 0.8, left: "1 sub-task left of 5." });
    expect(closeness({ category: "doing", steps: { done: 10, total: 10 }, subtasks: { done: 1, total: 5 } })).toBeNull();
  });

  it("waiting to be checked is as near as it gets", () => {
    expect(closeness({ category: "verify", steps: null, subtasks: null })).toEqual({ ratio: 0.95, left: "The work is done. It is waiting to be checked and closed." });
    expect(closeness({ category: "verify", steps: { done: 9, total: 10 }, subtasks: null })).toEqual({ ratio: 0.9, left: "1 step left of 10." });
  });
});

describe("the finish line", () => {
  it("shows three at most, the nearest first", () => {
    const line = finishLine(
      [
        c({ id: "1", steps: { done: 8, total: 10 } }),
        c({ id: "2", steps: { done: 10, total: 10 } }),
        c({ id: "3", category: "verify" }),
        c({ id: "4", subtasks: { done: 9, total: 10 } }),
        c({ id: "5", steps: { done: 1, total: 10 } }),
      ],
      NOW,
    );
    expect(line.map((i) => i.id)).toEqual(["2", "3", "4"]);
  });

  it("among equals, the one that has waited longest comes first", () => {
    const line = finishLine(
      [c({ id: "new", steps: { done: 4, total: 5 }, updated_at: "2026-11-19T12:00:00Z" }), c({ id: "old", steps: { done: 4, total: 5 }, updated_at: "2026-10-01T12:00:00Z" })],
      NOW,
    );
    expect(line.map((i) => i.id)).toEqual(["old", "new"]);
    expect(line[0].idle_days).toBe(50);
    expect(line[1].idle_days).toBe(1);
  });

  it("carries the ticket's next step, or where it was parked", () => {
    const line = finishLine(
      [
        c({ id: "1", steps: { done: 9, total: 10 }, next_step: "Screw the last hinge on." }),
        c({ id: "2", steps: { done: 8, total: 10 }, parked_note: "door hung, latch next" }),
        c({ id: "3", subtasks: { done: 4, total: 5 } }),
      ],
      NOW,
    );
    expect(line.map((i) => i.next_step)).toEqual(["Screw the last hinge on.", "Pick up where it was left: door hung, latch next", null]);
  });

  it("never shows what is finished, dropped, or not yet triaged", () => {
    const line = finishLine([c({ id: "1", category: "done", steps: { done: 10, total: 10 } }), c({ id: "2", category: "cancelled", steps: { done: 9, total: 10 } }), c({ id: "3", category: "inbox", steps: { done: 9, total: 10 } })], NOW);
    expect(line).toEqual([]);
  });

  it("says nothing the wording table forbids", () => {
    const line = finishLine([c({ id: "1", steps: { done: 8, total: 10 }, updated_at: "2025-01-01T00:00:00Z" }), c({ id: "2", category: "verify" }), c({ id: "3", steps: { done: 6, total: 6 } })], NOW);
    for (const item of line) expect(bannedIn(item.left)).toBeNull();
  });
});
