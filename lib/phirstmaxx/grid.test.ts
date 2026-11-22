import { describe, expect, it } from "vitest";
import {
  blockLayout,
  cellKey,
  cellRuns,
  instantToSlot,
  mergeAdjacent,
  overlaps,
  rangesFromSelection,
  rectangle,
  rowLabel,
  rowOfTime,
  shiftWeek,
  slotToInstant,
  summarise,
  toggleRectangle,
  weekStartOf,
} from "./grid";
import type { PmBlock } from "./types";

const iso = (ms: number) => new Date(ms).toISOString();
const at = (s: string) => new Date(s).getTime();

function block(over: Partial<PmBlock>): PmBlock {
  return {
    id: "b",
    person_id: "p",
    entered_by: "p",
    type_id: "work",
    engine_kind: "work",
    starts_at: "2026-11-23T09:00:00.000Z",
    ends_at: "2026-11-23T17:00:00.000Z",
    firmness: "firm",
    place_id: null,
    title: null,
    series_id: null,
    local: false,
    ...over,
  };
}

describe("weeks", () => {
  it("finds the Monday of the London week", () => {
    expect(weekStartOf("2026-11-23")).toBe("2026-11-23");
    expect(weekStartOf("2026-11-21")).toBe("2026-11-16");
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });
  it("shifts by whole weeks", () => {
    expect(shiftWeek("2026-11-23", 1)).toBe("2026-11-30");
    expect(shiftWeek("2026-11-23", -1)).toBe("2026-11-16");
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
  });
  it("labels rows and finds the row of a time", () => {
    expect(rowLabel(0)).toBe("00:00");
    expect(rowLabel(19)).toBe("09:30");
    expect(rowOfTime("07:00")).toBe(14);
    expect(rowOfTime("07:45")).toBe(15);
  });
});

describe("slots in winter and summer", () => {
  it("maps a GMT week's rows to UTC", () => {
    expect(iso(slotToInstant("2026-11-23", 0, 18))).toBe("2026-11-23T09:00:00.000Z");
    expect(iso(slotToInstant("2026-11-23", 6, 48))).toBe("2026-11-30T00:00:00.000Z");
    expect(instantToSlot("2026-11-23", at("2026-11-24T13:30:00Z"))).toEqual({ d: 1, r: 27 });
    expect(instantToSlot("2026-11-23", at("2026-11-30T00:00:00Z"))).toBeNull();
    expect(instantToSlot("2026-11-23", at("2026-11-22T23:59:00Z"))).toBeNull();
  });
  it("maps a BST week's rows an hour earlier", () => {
    expect(iso(slotToInstant("2026-06-15", 0, 18))).toBe("2026-06-15T08:00:00.000Z");
    expect(instantToSlot("2026-06-15", at("2026-06-14T23:00:00Z"))).toEqual({ d: 0, r: 0 });
  });
});

describe("spring forward, Sunday 2026-03-29", () => {
  const W = "2026-03-23";
  it("the missing 01:00 and 01:30 rows map to 02:00 and are zero-length", () => {
    expect(iso(slotToInstant(W, 6, 1))).toBe("2026-03-29T00:30:00.000Z");
    expect(iso(slotToInstant(W, 6, 2))).toBe("2026-03-29T01:00:00.000Z");
    expect(iso(slotToInstant(W, 6, 3))).toBe("2026-03-29T01:00:00.000Z");
    expect(iso(slotToInstant(W, 6, 4))).toBe("2026-03-29T01:00:00.000Z");
    expect(iso(slotToInstant(W, 6, 18))).toBe("2026-03-29T08:00:00.000Z");
    expect(instantToSlot(W, at("2026-03-29T01:00:00Z"))).toEqual({ d: 6, r: 4 });
  });
  it("skips a selection of only the missing hour and shortens one running through it", () => {
    expect(rangesFromSelection(W, new Set([cellKey(6, 2), cellKey(6, 3)]))).toEqual([]);
    const r = rangesFromSelection(W, new Set(rectangle({ d: 6, r: 0 }, { d: 6, r: 5 })));
    expect(r).toHaveLength(1);
    expect(iso(r[0].start)).toBe("2026-03-29T00:00:00.000Z");
    expect(iso(r[0].end)).toBe("2026-03-29T02:00:00.000Z");
    expect(summarise(r)).toBe("1 range, 2 h");
  });
  it("a whole Sunday is 23 hours", () => {
    expect(summarise(rangesFromSelection(W, new Set(rectangle({ d: 6, r: 0 }, { d: 6, r: 47 }))))).toBe("1 range, 23 h");
  });
});

describe("fall back, Sunday 2026-10-25", () => {
  const W = "2026-10-19";
  it("the repeated hour collapses onto its first occurrence", () => {
    expect(iso(slotToInstant(W, 6, 2))).toBe("2026-10-25T00:00:00.000Z");
    expect(iso(slotToInstant(W, 6, 3))).toBe("2026-10-25T00:30:00.000Z");
    expect(iso(slotToInstant(W, 6, 4))).toBe("2026-10-25T02:00:00.000Z");
    // The second 01:15 (GMT) lands in the 01:30 row.
    expect(instantToSlot(W, at("2026-10-25T01:15:00Z"))).toEqual({ d: 6, r: 3 });
  });
  it("the 01:30 row is 90 minutes and the whole Sunday is 25 hours", () => {
    expect(summarise(rangesFromSelection(W, new Set([cellKey(6, 3)])))).toBe("1 range, 1 h 30");
    expect(summarise(rangesFromSelection(W, new Set(rectangle({ d: 6, r: 0 }, { d: 6, r: 47 }))))).toBe("1 range, 25 h");
  });
});

describe("painting", () => {
  it("builds the rectangle across slots and days whichever way it is dragged", () => {
    const a = rectangle({ d: 0, r: 18 }, { d: 2, r: 19 });
    const b = rectangle({ d: 2, r: 19 }, { d: 0, r: 18 });
    expect(a).toEqual(["0:18", "0:19", "1:18", "1:19", "2:18", "2:19"]);
    expect(new Set(b)).toEqual(new Set(a));
  });
  it("adds a second range and removes by re-painting a highlight", () => {
    let sel = toggleRectangle(new Set(), rectangle({ d: 0, r: 18 }, { d: 0, r: 33 }));
    sel = toggleRectangle(sel, rectangle({ d: 1, r: 18 }, { d: 1, r: 33 }));
    expect(sel.size).toBe(32);
    // Dragging over part of a highlight removes that part.
    sel = toggleRectangle(sel, rectangle({ d: 0, r: 30 }, { d: 0, r: 33 }));
    expect(sel.size).toBe(28);
    expect(sel.has("0:30")).toBe(false);
    // A rectangle only partly highlighted adds the rest.
    sel = toggleRectangle(sel, rectangle({ d: 0, r: 28 }, { d: 0, r: 33 }));
    expect(sel.has("0:33")).toBe(true);
    expect(sel.size).toBe(32);
  });
  it("merges adjacent slots on a day into ranges and ends at midnight", () => {
    const sel = new Set([...rectangle({ d: 0, r: 18 }, { d: 0, r: 33 }), ...rectangle({ d: 0, r: 40 }, { d: 0, r: 47 }), "1:0"]);
    const r = rangesFromSelection("2026-11-23", sel);
    expect(r.map((x) => [iso(x.start), iso(x.end)])).toEqual([
      ["2026-11-23T09:00:00.000Z", "2026-11-23T17:00:00.000Z"],
      ["2026-11-23T20:00:00.000Z", "2026-11-24T00:00:00.000Z"],
      ["2026-11-24T00:00:00.000Z", "2026-11-24T00:30:00.000Z"],
    ]);
  });
});

describe("cellRuns", () => {
  it("groups highlighted cells into runs per day for drawing", () => {
    expect(cellRuns(["1:5", "0:3", "0:4", "0:6", "1:6"])).toEqual([
      { d: 0, r0: 3, r1: 4 },
      { d: 0, r0: 6, r1: 6 },
      { d: 1, r0: 5, r1: 6 },
    ]);
  });
});

describe("summary wording", () => {
  it("counts ranges and hours", () => {
    const h = 3_600_000;
    expect(summarise([{ start: 0, end: 1.5 * h }])).toBe("1 range, 1 h 30");
    expect(summarise([{ start: 0, end: 0.5 * h }])).toBe("1 range, 30 min");
    expect(summarise(Array.from({ length: 5 }, (_, i) => ({ start: i * 10 * h, end: i * 10 * h + 6.2 * h })))).toBe("5 ranges, 31 h");
    expect(summarise([])).toBe("0 ranges, 0 min");
  });
});

describe("overlaps", () => {
  it("lists the blocks each range touches, not the ones it only meets end to end", () => {
    const work = block({ id: "w" });
    const evening = block({ id: "e", starts_at: "2026-11-23T18:00:00.000Z", ends_at: "2026-11-23T20:00:00.000Z" });
    const r = [
      { start: at("2026-11-23T16:00:00Z"), end: at("2026-11-23T18:30:00Z") },
      { start: at("2026-11-23T17:00:00Z"), end: at("2026-11-23T18:00:00Z") },
      { start: at("2026-11-24T09:00:00Z"), end: at("2026-11-24T10:00:00Z") },
    ];
    const o = overlaps(r, [work, evening]);
    expect(o).toHaveLength(1);
    expect(o[0].blocks.map((b) => b.id)).toEqual(["w", "e"]);
  });
});

describe("mergeAdjacent", () => {
  it("joins touching blocks of the same kind and keeps different ones apart", () => {
    const a = block({ id: "a", starts_at: "2026-11-23T09:00:00.000Z", ends_at: "2026-11-23T12:00:00.000Z" });
    const b = block({ id: "b", starts_at: "2026-11-23T12:00:00.000Z", ends_at: "2026-11-23T17:00:00.000Z" });
    const flex = block({ id: "c", starts_at: "2026-11-23T17:00:00.000Z", ends_at: "2026-11-23T18:00:00.000Z", firmness: "flexible" });
    const titled = block({ id: "d", starts_at: "2026-11-23T18:00:00.000Z", ends_at: "2026-11-23T19:00:00.000Z", firmness: "flexible", title: "Gym" });
    const gap = block({ id: "e", starts_at: "2026-11-23T20:00:00.000Z", ends_at: "2026-11-23T21:00:00.000Z" });
    const m = mergeAdjacent([b, a, flex, titled, gap]);
    expect(m.map((x) => [x.id, x.starts_at, x.ends_at])).toEqual([
      ["a", "2026-11-23T09:00:00.000Z", "2026-11-23T17:00:00.000Z"],
      ["c", "2026-11-23T17:00:00.000Z", "2026-11-23T18:00:00.000Z"],
      ["d", "2026-11-23T18:00:00.000Z", "2026-11-23T19:00:00.000Z"],
      ["e", "2026-11-23T20:00:00.000Z", "2026-11-23T21:00:00.000Z"],
    ]);
  });
});

describe("blockLayout", () => {
  const W = "2026-11-23";
  it("draws a day block on one day", () => {
    expect(blockLayout(W, block({}))).toEqual([{ dayIndex: 0, topRow: 18, rowSpan: 16 }]);
  });
  it("draws a night shift crossing midnight on two days", () => {
    const night = block({ starts_at: "2026-11-24T22:00:00.000Z", ends_at: "2026-11-25T06:00:00.000Z" });
    expect(blockLayout(W, night)).toEqual([
      { dayIndex: 1, topRow: 44, rowSpan: 4 },
      { dayIndex: 2, topRow: 0, rowSpan: 12 },
    ]);
  });
  it("clips a block running into the next week", () => {
    const late = block({ starts_at: "2026-11-29T23:00:00.000Z", ends_at: "2026-11-30T07:00:00.000Z" });
    expect(blockLayout(W, late)).toEqual([{ dayIndex: 6, topRow: 46, rowSpan: 2 }]);
  });
  it("lays out across both clock changes by wall-clock rows", () => {
    // 00:00–03:00 London on the spring Sunday: 00:00Z–02:00Z, drawn rows 0–5.
    expect(blockLayout("2026-03-23", block({ starts_at: "2026-03-29T00:00:00.000Z", ends_at: "2026-03-29T02:00:00.000Z" }))).toEqual([{ dayIndex: 6, topRow: 0, rowSpan: 6 }]);
    // 09:00–17:00 London on the autumn Sunday (GMT again).
    expect(blockLayout("2026-10-19", block({ starts_at: "2026-10-25T09:00:00.000Z", ends_at: "2026-10-25T17:00:00.000Z" }))).toEqual([{ dayIndex: 6, topRow: 18, rowSpan: 16 }]);
    // The Saturday before is BST: 09:00 London is 08:00Z.
    expect(blockLayout("2026-10-19", block({ starts_at: "2026-10-24T08:00:00.000Z", ends_at: "2026-10-24T16:00:00.000Z" }))).toEqual([{ dayIndex: 5, topRow: 18, rowSpan: 16 }]);
  });
});
