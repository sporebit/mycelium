import { describe, expect, it } from "vitest";
import type { EngineKind } from "../types";
import { addLondonDays, londonClock, londonDate, londonTime } from "./time";
import {
  DEFAULT_BUFFERS,
  DEFAULT_WAKING,
  findWindows,
  totalFirmMinutes,
  type EngineWindow,
  type WakingSettings,
  type WindowBlock,
  type WindowPersonInput,
} from "./windows";

const PHIL = "phil";
const KIRSTY = "kirsty";

const FLAT_WAKING: WakingSettings = {
  weekday: { start: "07:00", end: "23:00" },
  weekend: { start: "07:00", end: "23:00" },
};
const hours = (weekday: [string, string], weekend: [string, string] = weekday): WakingSettings => ({
  weekday: { start: weekday[0], end: weekday[1] },
  weekend: { start: weekend[0], end: weekend[1] },
});

function block(personId: string, day: string, start: string, end: string, kind: EngineKind = "busy", extra: Partial<WindowBlock> = {}): WindowBlock {
  // An end at or before the start means "next day".
  const s = londonTime(day, start);
  let e = londonTime(day, end);
  if (e <= s) e = londonTime(addLondonDays(day, 1), end);
  return { person_id: personId, kind, firmness: "firm", start: s, end: e, place_id: null, has_car: true, has_pet: false, status: "confirmed", ...extra };
}

function person(id: string, blocks: WindowBlock[], knownDays: string[], extra: Partial<WindowPersonInput> = {}): WindowPersonInput {
  return {
    id,
    home_place_id: `${id}-home`,
    has_car: true,
    has_pet: false,
    overnightSitsJoinable: false,
    // Flat 07:00–23:00 every day so the older cases keep their numbers; the
    // weekend-night default is exercised on its own below.
    waking: FLAT_WAKING,
    buffers: DEFAULT_BUFFERS,
    blocks,
    knownDays: new Set(knownDays),
    ...extra,
  };
}

const day = (d: string) => ({ start: londonTime(d, "00:00"), end: londonTime(addLondonDays(d, 1), "00:00") });

const clocks = (ws: EngineWindow[]) => ws.map((w) => `${londonClock(w.start)}-${londonClock(w.end)}`);
const firmClocks = (ws: EngineWindow[]) => ws.map((w) => `${w.firmness} ${londonClock(w.start)}-${londonClock(w.end)}`);
const dayClocks = (ws: EngineWindow[]) => ws.map((w) => `${w.day} ${londonClock(w.start)}-${londonClock(w.end)}`);

describe("findWindows — basics", () => {
  it("returns nothing for an empty range or no people", () => {
    expect(findWindows({ range: day("2026-08-21"), people: [] })).toEqual([]);
  });

  it("finds the whole waking day when both are free and days are known", () => {
    const ws = findWindows({ range: day("2026-08-21"), people: [person(PHIL, [], ["2026-08-21"]), person(KIRSTY, [], ["2026-08-21"])] });
    expect(clocks(ws)).toEqual(["07:00-23:00"]);
    expect(ws[0].firmness).toBe("firm");
    expect(ws[0].tentative).toBe(false);
    expect(ws[0].minutes).toBe(16 * 60);
  });

  it("marks windows tentative when either day is unknown", () => {
    const ws = findWindows({ range: day("2026-08-21"), people: [person(PHIL, [], ["2026-08-21"]), person(KIRSTY, [], [])] });
    expect(ws[0].tentative).toBe(true);
    expect(totalFirmMinutes(ws)).toBe(0);
  });

  it("drops windows shorter than the minimum", () => {
    const ws = findWindows({
      range: day("2026-08-21"),
      people: [person(PHIL, [block(PHIL, "2026-08-21", "07:00", "22:00")], ["2026-08-21"]), person(KIRSTY, [], ["2026-08-21"])],
    });
    expect(ws).toEqual([]);
  });
});

describe("findWindows — buffers and shifts", () => {
  const d = "2026-08-21";

  it("applies the shift buffer after Kirsty's shift", () => {
    const ws = findWindows({ range: day(d), people: [person(PHIL, [], [d]), person(KIRSTY, [block(KIRSTY, d, "11:00", "15:00", "shift")], [d])] });
    expect(clocks(ws)).toEqual(["07:00-11:00", "15:15-23:00"]);
  });

  it("applies the longer sit buffer", () => {
    const ws = findWindows({ range: day(d), people: [person(PHIL, [], [d]), person(KIRSTY, [block(KIRSTY, d, "09:00", "13:00", "sit")], [d])] });
    expect(clocks(ws)).toEqual(["07:00-09:00", "13:30-23:00"]);
  });

  it("handles a split shift", () => {
    const ws = findWindows({
      range: day(d),
      people: [
        person(PHIL, [], [d]),
        person(KIRSTY, [block(KIRSTY, d, "11:00", "15:00", "shift"), block(KIRSTY, d, "17:00", "23:00", "shift")], [d]),
      ],
    });
    // 15:15–17:00 is 1 h 45, over the 90-minute floor.
    expect(clocks(ws)).toEqual(["07:00-11:00", "15:15-17:00"]);
  });

  it("combines both people's blocks", () => {
    const ws = findWindows({
      range: day(d),
      people: [person(PHIL, [block(PHIL, d, "09:00", "17:30", "work")], [d]), person(KIRSTY, [block(KIRSTY, d, "18:00", "20:00", "walk")], [d])],
    });
    expect(clocks(ws)).toEqual(["07:00-09:00", "20:15-23:00"]);
  });
});

describe("findWindows — overnight and midnight", () => {
  it("treats a sit that crosses midnight as busy on both days", () => {
    const ws = findWindows({
      range: { start: londonTime("2026-08-21", "00:00"), end: londonTime("2026-08-23", "00:00") },
      people: [
        person(PHIL, [], ["2026-08-21", "2026-08-22"]),
        person(KIRSTY, [block(KIRSTY, "2026-08-21", "20:00", "08:00", "sit")], ["2026-08-21", "2026-08-22"]),
      ],
    });
    expect(dayClocks(ws)).toEqual(["2026-08-21 07:00-20:00", "2026-08-22 08:30-23:00"]);
  });

  it("a multi-day sit removes every day it covers", () => {
    const days = ["2026-08-21", "2026-08-22", "2026-08-23"];
    const ws = findWindows({
      range: { start: londonTime("2026-08-21", "00:00"), end: londonTime("2026-08-24", "00:00") },
      people: [
        person(PHIL, [], days),
        person(KIRSTY, [{ ...block(KIRSTY, "2026-08-21", "12:00", "12:00", "sit"), end: londonTime("2026-08-23", "10:00") }], days),
      ],
    });
    expect(dayClocks(ws)).toEqual(["2026-08-21 07:00-12:00", "2026-08-23 10:30-23:00"]);
  });

  it("a joinable overnight sit becomes a flexible window", () => {
    const d = "2026-08-21";
    const ws = findWindows({
      range: day(d),
      people: [person(PHIL, [], [d]), person(KIRSTY, [block(KIRSTY, d, "19:00", "08:00", "sit")], [d], { overnightSitsJoinable: true })],
    });
    expect(firmClocks(ws)).toEqual(["firm 07:00-19:00", "flexible 19:00-23:00"]);
  });
});

describe("findWindows — flexibility", () => {
  const d = "2026-08-21";

  it("separates firm evenings from flexible daytime on Phil's work block", () => {
    const ws = findWindows({
      range: day(d),
      people: [person(PHIL, [block(PHIL, d, "09:00", "17:00", "work", { firmness: "flexible" })], [d]), person(KIRSTY, [], [d])],
    });
    expect(firmClocks(ws)).toEqual(["firm 07:00-09:00", "flexible 09:00-17:00", "firm 17:00-23:00"]);
    expect(totalFirmMinutes(ws)).toBe(8 * 60);
  });

  it("flexible means flexible for any kind — a shift or busy block, not just work", () => {
    // "Set in stone" is the only thing that hard-blocks. A flexible shift
    // also loses its buffer, since it is not hard busy.
    for (const kind of ["shift", "busy", "sit", "faith"] as const) {
      const ws = findWindows({
        range: day(d),
        people: [person(KIRSTY, [block(KIRSTY, d, "12:00", "18:00", kind, { firmness: "flexible" })], [d]), person(PHIL, [], [d])],
      });
      expect(firmClocks(ws), kind).toEqual(["firm 07:00-12:00", "flexible 12:00-18:00", "firm 18:00-23:00"]);
    }
  });

  it("a set-in-stone shift hard-blocks and keeps its buffer", () => {
    const ws = findWindows({ range: day(d), people: [person(KIRSTY, [block(KIRSTY, d, "12:00", "18:00", "shift")], [d]), person(PHIL, [], [d])] });
    expect(firmClocks(ws)).toEqual(["firm 07:00-12:00", "firm 18:15-23:00"]);
  });

  it("a free block overrides a flexible block", () => {
    const ws = findWindows({
      range: day(d),
      people: [
        person(PHIL, [block(PHIL, d, "09:00", "17:00", "work", { firmness: "flexible" }), block(PHIL, d, "12:00", "14:00", "free")], [d]),
        person(KIRSTY, [], [d]),
      ],
    });
    expect(firmClocks(ws)).toEqual(["firm 07:00-09:00", "flexible 09:00-12:00", "firm 12:00-14:00", "flexible 14:00-17:00", "firm 17:00-23:00"]);
  });

  it("a free block never overrides hard busy", () => {
    const ws = findWindows({
      range: day(d),
      people: [person(PHIL, [block(PHIL, d, "09:00", "17:00", "busy"), block(PHIL, d, "12:00", "14:00", "free")], [d]), person(KIRSTY, [], [d])],
    });
    expect(clocks(ws)).toEqual(["07:00-09:00", "17:00-23:00"]);
  });
});

describe("findWindows — status", () => {
  const d = "2026-08-21";

  it("pending-confirm blocks count as busy", () => {
    const ws = findWindows({
      range: day(d),
      people: [person(PHIL, [], [d]), person(KIRSTY, [block(KIRSTY, d, "07:00", "20:00", "shift", { status: "pending_confirm" })], [d])],
    });
    expect(clocks(ws)).toEqual(["20:15-23:00"]);
  });

  it("rejected blocks are ignored", () => {
    const ws = findWindows({
      range: day(d),
      people: [person(PHIL, [], [d]), person(KIRSTY, [block(KIRSTY, d, "07:00", "20:00", "shift", { status: "rejected" })], [d])],
    });
    expect(clocks(ws)).toEqual(["07:00-23:00"]);
  });
});

describe("findWindows — where each person is", () => {
  const d = "2026-08-21";

  it("reports the place of the block that just ended, else home", () => {
    const ws = findWindows({
      range: day(d),
      people: [
        person(PHIL, [], [d]),
        person(KIRSTY, [block(KIRSTY, d, "11:00", "15:00", "shift", { place_id: "pub", has_car: false, has_pet: true })], [d]),
      ],
    });
    const morning = ws[0].people.find((p) => p.person_id === KIRSTY);
    const afternoon = ws[1].people.find((p) => p.person_id === KIRSTY);
    expect(morning?.place_id).toBe("kirsty-home");
    expect(morning?.has_car).toBe(true);
    expect(afternoon?.place_id).toBe("pub");
    expect(afternoon?.has_car).toBe(false);
    expect(afternoon?.has_pet).toBe(true);
  });

  it("a free block covering the start wins", () => {
    const ws = findWindows({
      range: day(d),
      people: [
        person(PHIL, [], [d]),
        person(
          KIRSTY,
          [block(KIRSTY, d, "11:00", "15:00", "shift", { place_id: "pub" }), block(KIRSTY, d, "15:00", "23:00", "free", { place_id: "phil-home", has_pet: true })],
          [d],
        ),
      ],
    });
    const afternoon = ws[1].people.find((p) => p.person_id === KIRSTY);
    expect(afternoon?.place_id).toBe("phil-home");
    expect(afternoon?.has_pet).toBe(true);
  });
});

describe("findWindows — recurring across DST", () => {
  it("a weekly Monday shift stays at 17:00 London on both sides of March", () => {
    const shift = block(KIRSTY, "2026-03-23", "17:00", "23:00", "shift", { rule: "FREQ=WEEKLY" });
    const known = ["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30"];
    const ws = findWindows({
      range: { start: londonTime("2026-03-23", "00:00"), end: londonTime("2026-03-31", "00:00") },
      people: [person(PHIL, [], known), person(KIRSTY, [shift], known)],
    });
    const mondays = ws.filter((w) => w.day === "2026-03-23" || w.day === "2026-03-30");
    expect(dayClocks(mondays)).toEqual(["2026-03-23 07:00-17:00", "2026-03-30 07:00-17:00"]);
    // And the underlying instants moved by an hour, as they should.
    expect(new Date(mondays[0].end).toISOString()).toBe("2026-03-23T17:00:00.000Z");
    expect(new Date(mondays[1].end).toISOString()).toBe("2026-03-30T16:00:00.000Z");
  });

  it("the 25-hour October day still yields 07:00–23:00", () => {
    const d = "2026-10-25";
    const ws = findWindows({ range: day(d), people: [person(PHIL, [], [d]), person(KIRSTY, [], [d])] });
    expect(clocks(ws)).toEqual(["07:00-23:00"]);
    expect(ws[0].minutes).toBe(16 * 60);
    expect(londonDate(ws[0].start)).toBe(d);
  });
});

describe("findWindows — a fortnight with nothing filled in", () => {
  it("returns only tentative windows", () => {
    const ws = findWindows({
      range: { start: londonTime("2026-08-17", "00:00"), end: londonTime("2026-08-31", "00:00") },
      people: [person(PHIL, [], []), person(KIRSTY, [], [])],
    });
    expect(ws).toHaveLength(14);
    expect(ws.every((w) => w.tentative)).toBe(true);
  });
});

describe("findWindows — per-person waking hours", () => {
  const sat = "2026-09-12";
  const span = (from: string, to: string, toClock = "00:00") => ({ start: londonTime(from, "00:00"), end: londonTime(to, toClock) });

  it("a Saturday night runs past midnight and belongs to Saturday", () => {
    const ws = findWindows({
      range: span(sat, "2026-09-13", "12:00"),
      people: [
        person(PHIL, [], [sat, "2026-09-13"], { waking: DEFAULT_WAKING }),
        person(KIRSTY, [], [sat, "2026-09-13"], { waking: DEFAULT_WAKING }),
      ],
    });
    expect(clocks(ws)).toEqual(["08:00-00:30", "07:00-12:00"]);
    expect(ws[0].day).toBe(sat);
    expect(ws[0].minutes).toBe(16 * 60 + 30);
    expect(ws[1].day).toBe("2026-09-13");
  });

  it("Friday counts as a weekend night, Sunday does not", () => {
    const ws = findWindows({
      range: span("2026-09-11", "2026-09-14"),
      people: [person(PHIL, [], [], { waking: DEFAULT_WAKING }), person(KIRSTY, [], [], { waking: DEFAULT_WAKING })],
    });
    expect(clocks(ws)).toEqual(["08:00-00:30", "08:00-00:30", "07:00-23:00"]);
  });

  it("the overlap is the intersection of two people's different hours", () => {
    const d = "2026-09-09";
    const ws = findWindows({
      range: day(d),
      people: [person(PHIL, [], [d], { waking: hours(["07:00", "22:00"]) }), person(KIRSTY, [], [d], { waking: hours(["09:00", "23:30"]) })],
    });
    expect(clocks(ws)).toEqual(["09:00-22:00"]);
  });

  it("a window can end exactly on a waking bound", () => {
    const d = "2026-09-09";
    const ws = findWindows({
      range: day(d),
      people: [person(PHIL, [block(PHIL, d, "07:00", "12:00")], [d], { waking: hours(["07:00", "22:00"]) }), person(KIRSTY, [], [d])],
    });
    expect(clocks(ws)).toEqual(["12:00-22:00"]);
    expect(ws[0].minutes).toBe(10 * 60);
  });

  it("a late one tonight extends both people's evening", () => {
    const d = "2026-09-09";
    const ws = findWindows({
      range: span(d, "2026-09-10", "06:00"),
      people: [person(PHIL, [], [d], { waking: hours(["07:00", "22:00"]) }), person(KIRSTY, [], [d])],
      dayOverrides: { [d]: "01:00" },
    });
    expect(clocks(ws)).toEqual(["07:00-01:00"]);
    expect(ws[0].day).toBe(d);
  });

  it("crosses the March changeover: 02:00 the next morning is an hour sooner", () => {
    // Clocks go forward at 01:00 GMT on Sunday 29 March 2026.
    const d = "2026-03-28";
    const ws = findWindows({
      range: span(d, "2026-03-29", "06:00"),
      people: [person(PHIL, [], [d], { waking: DEFAULT_WAKING }), person(KIRSTY, [], [d], { waking: DEFAULT_WAKING })],
      dayOverrides: { [d]: "02:00" },
    });
    expect(clocks(ws)).toEqual(["08:00-02:00"]);
    // 08:00 GMT Sat to 02:00 BST Sun is 01:00 GMT: seventeen hours, not eighteen.
    expect(ws[0].minutes).toBe(17 * 60);
  });

  it("crosses the October changeover without dropping the window", () => {
    // Clocks go back at 02:00 BST on Sunday 25 October 2026.
    const d = "2026-10-24";
    const ws = findWindows({
      range: span(d, "2026-10-25", "06:00"),
      people: [person(PHIL, [], [d], { waking: DEFAULT_WAKING }), person(KIRSTY, [], [d], { waking: DEFAULT_WAKING })],
      dayOverrides: { [d]: "02:00" },
    });
    expect(clocks(ws)).toEqual(["08:00-02:00"]);
    expect([18 * 60, 19 * 60]).toContain(ws[0].minutes);
  });

  it("zero buffers make the window start the moment the shift ends", () => {
    const d = "2026-09-09";
    const ws = findWindows({
      range: day(d),
      people: [person(KIRSTY, [block(KIRSTY, d, "12:00", "18:00", "shift")], [d], { buffers: { ...DEFAULT_BUFFERS, shift: 0 } }), person(PHIL, [], [d])],
    });
    expect(clocks(ws)).toEqual(["07:00-12:00", "18:00-23:00"]);
  });

  it("each person's own buffer applies, not a shared one", () => {
    const d = "2026-09-09";
    const ws = findWindows({
      range: day(d),
      people: [person(KIRSTY, [block(KIRSTY, d, "12:00", "18:00", "shift")], [d], { buffers: { ...DEFAULT_BUFFERS, shift: 45 } }), person(PHIL, [], [d])],
    });
    expect(clocks(ws)).toEqual(["07:00-12:00", "18:45-23:00"]);
  });

  it("a large buffer can swallow a window below the minimum length", () => {
    const d = "2026-09-09";
    const ws = findWindows({
      range: day(d),
      people: [person(KIRSTY, [block(KIRSTY, d, "12:00", "20:00", "shift")], [d], { buffers: { ...DEFAULT_BUFFERS, shift: 120 } }), person(PHIL, [], [d])],
    });
    // 22:00–23:00 is an hour, under the 90-minute minimum, so only the morning survives.
    expect(clocks(ws)).toEqual(["07:00-12:00"]);
  });
});

// New with the port: the shared EngineBlock has no knownDays, so a person
// without the set is treated as known rather than tentative.
describe("findWindows — new defaults", () => {
  it("a person with no knownDays set is never tentative", () => {
    const d = "2026-08-21";
    const ws = findWindows({ range: day(d), people: [person(PHIL, [], [], { knownDays: undefined }), person(KIRSTY, [], [], { knownDays: undefined })] });
    expect(ws[0].tentative).toBe(false);
  });
});
