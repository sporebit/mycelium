import { describe, expect, it } from "vitest";
import { canUndo, groupForSave, isHalfHour, lastBatchFrom, lastUsedFrom, patternFromBlocks, rangesFromPattern, settingsAfterSave, settingsAfterUndo, shiftRangeWeeks } from "./weekShape";

const T1 = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const block = (starts_at: string, ends_at: string, extra: Partial<{ type_id: string; firmness: "firm" | "flexible"; place_id: string | null; title: string | null }> = {}) => ({
  starts_at,
  ends_at,
  type_id: T1,
  firmness: "firm" as const,
  place_id: null,
  title: null,
  ...extra,
});

describe("patterns", () => {
  it("a summer week becomes slots relative to Monday London 00:00", () => {
    // 2026-07-06 is a Monday; 08:00 BST is 07:00Z
    const p = patternFromBlocks("2026-07-06", [block("2026-07-06T07:00:00.000Z", "2026-07-06T15:30:00.000Z"), block("2026-07-10T21:00:00.000Z", "2026-07-11T01:00:00.000Z", { title: "Late" })]);
    expect(p).toEqual([
      { dow: 0, start_min: 8 * 60, end_min: 16 * 60 + 30, type_id: T1, firmness: "firm", place_id: null, title: null },
      // Friday 22:00 to Saturday 02:00 London: the end runs past midnight
      { dow: 4, start_min: 22 * 60, end_min: 24 * 60 + 2 * 60, type_id: T1, firmness: "firm", place_id: null, title: "Late" },
    ]);
  });

  it("a block that starts before the week is not part of its shape", () => {
    const p = patternFromBlocks("2026-07-06", [block("2026-07-05T22:00:00.000Z", "2026-07-06T06:00:00.000Z")]);
    expect(p).toEqual([]);
  });

  it("the same pattern lands on the same wall-clock times in winter", () => {
    const p = patternFromBlocks("2026-07-06", [block("2026-07-06T07:00:00.000Z", "2026-07-06T15:30:00.000Z")]);
    // 2026-12-07 is a Monday; 08:00 GMT is 08:00Z
    const r = rangesFromPattern("2026-12-07", p);
    expect(r).toEqual([{ start: "2026-12-07T08:00:00.000Z", end: "2026-12-07T16:30:00.000Z", type_id: T1, firmness: "firm", place_id: null, title: null }]);
  });

  it("a pattern crossing midnight comes back as one range on the right night", () => {
    const r = rangesFromPattern("2026-12-07", [{ dow: 4, start_min: 22 * 60, end_min: 26 * 60, type_id: T1, firmness: "flexible", place_id: P1, title: "Late" }]);
    expect(r).toEqual([{ start: "2026-12-11T22:00:00.000Z", end: "2026-12-12T02:00:00.000Z", type_id: T1, firmness: "flexible", place_id: P1, title: "Late" }]);
  });

  it("round trip: blocks → pattern → ranges reproduce the week", () => {
    const blocks = [block("2026-03-02T09:00:00.000Z", "2026-03-02T17:00:00.000Z"), block("2026-03-04T13:00:00.000Z", "2026-03-04T21:30:00.000Z", { firmness: "flexible" })];
    const back = rangesFromPattern("2026-03-02", patternFromBlocks("2026-03-02", blocks));
    expect(back.map((r) => [r.start, r.end])).toEqual(blocks.map((b) => [b.starts_at, b.ends_at]));
  });

  it("a pattern slot in the missing spring hour is dropped rather than saved as nothing", () => {
    // 2026-03-29 is the Sunday the clocks go forward; dow 6 of the week starting 2026-03-23
    const r = rangesFromPattern("2026-03-23", [{ dow: 6, start_min: 60, end_min: 120, type_id: T1, firmness: "firm", place_id: null, title: null }]);
    expect(r).toEqual([]);
  });
});

describe("shifting a week", () => {
  it("keeps the London wall-clock time across the autumn clock change", () => {
    // Mon 2026-10-19 09:00 BST = 08:00Z; a week on, 09:00 GMT = 09:00Z
    expect(shiftRangeWeeks({ start: "2026-10-19T08:00:00.000Z", end: "2026-10-19T16:00:00.000Z" }, 1)).toEqual({ start: "2026-10-26T09:00:00.000Z", end: "2026-10-26T17:00:00.000Z" });
  });
  it("goes back a week too", () => {
    expect(shiftRangeWeeks({ start: "2026-10-26T09:00:00.000Z", end: "2026-10-26T17:00:00.000Z" }, -1)).toEqual({ start: "2026-10-19T08:00:00.000Z", end: "2026-10-19T16:00:00.000Z" });
  });
});

describe("grouping for pm_save_blocks", () => {
  it("one group per type, firmness, place and title, ranges in time order", () => {
    const g = groupForSave([
      { start: "2026-07-07T07:00:00.000Z", end: "2026-07-07T15:00:00.000Z", type_id: T1, firmness: "firm", place_id: null, title: null },
      { start: "2026-07-06T07:00:00.000Z", end: "2026-07-06T15:00:00.000Z", type_id: T1, firmness: "firm", place_id: null, title: null },
      { start: "2026-07-08T07:00:00.000Z", end: "2026-07-08T15:00:00.000Z", type_id: T1, firmness: "flexible", place_id: null, title: null },
      { start: "2026-07-09T07:00:00.000Z", end: "2026-07-09T15:00:00.000Z", type_id: T1, firmness: "firm", place_id: P1, title: "Away" },
    ]);
    expect(g).toHaveLength(3);
    expect(g[0].ranges.map((r) => r.start)).toEqual(["2026-07-06T07:00:00.000Z", "2026-07-07T07:00:00.000Z"]);
    expect(g[1]).toMatchObject({ firmness: "flexible", ranges: [{ start: "2026-07-08T07:00:00.000Z" }] });
    expect(g[2]).toMatchObject({ place_id: P1, title: "Away" });
  });
});

describe("last used and undo", () => {
  it("reads what the save bar needs, with safe defaults", () => {
    expect(lastUsedFrom(undefined)).toEqual({ type_id: null, firmness: "firm", place_id: null });
    expect(lastUsedFrom({ last_used: { type_id: T1, firmness: "flexible", place_id: "nope" } })).toEqual({ type_id: T1, firmness: "flexible", place_id: null });
  });

  it("a save can be undone for ten minutes, then not", () => {
    const now = Date.parse("2026-07-06T10:00:00.000Z");
    const s = settingsAfterSave({ research_cap_pence: 500 }, { type_id: T1, firmness: "firm", place_id: null }, [P1], now);
    expect(s.research_cap_pence).toBe(500);
    const batch = lastBatchFrom(s);
    expect(batch).toEqual({ ids: [P1], at: "2026-07-06T10:00:00.000Z" });
    expect(canUndo(batch, now + 9 * 60_000)).toBe(true);
    expect(canUndo(batch, now + 10 * 60_000)).toBe(false);
    expect(canUndo(batch, now - 1)).toBe(false);
    expect(canUndo(null, now)).toBe(false);
    expect(lastBatchFrom(settingsAfterUndo(s))).toBeNull();
  });

  it("an older single-id batch is still read", () => {
    expect(lastBatchFrom({ last_batch: { id: P1, at: "2026-07-06T10:00:00.000Z" } })).toEqual({ ids: [P1], at: "2026-07-06T10:00:00.000Z" });
    expect(lastBatchFrom({ last_batch: { at: "not a time" } })).toBeNull();
  });
});

describe("half hours", () => {
  it("accepts :00 and :30, refuses anything else", () => {
    expect(isHalfHour("2026-07-06T07:00:00.000Z")).toBe(true);
    expect(isHalfHour("2026-07-06T07:30:00.000Z")).toBe(true);
    expect(isHalfHour("2026-07-06T07:15:00.000Z")).toBe(false);
    expect(isHalfHour("garbage")).toBe(false);
  });
});
