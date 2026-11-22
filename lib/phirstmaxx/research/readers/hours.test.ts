import { describe, expect, it } from "vitest";
import { fromGooglePlaces, fromOsm, fromSchemaOrg, isOpenAt, isOpenFor, londonWeekdayMinute, normaliseTime } from "./hours";

describe("normaliseTime", () => {
  it("pads, drops seconds, accepts 24:00, refuses nonsense", () => {
    expect(normaliseTime("9:00")).toBe("09:00");
    expect(normaliseTime("09:30:00")).toBe("09:30");
    expect(normaliseTime("0900")).toBe("09:00");
    expect(normaliseTime("24:00")).toBe("24:00");
    expect(normaliseTime("25:00")).toBeNull();
    expect(normaliseTime("noon")).toBeNull();
  });
});

describe("fromOsm", () => {
  it("reads weekday ranges, single days and off", () => {
    const h = fromOsm("Mo-Fr 09:00-17:00; Sa 10:00-16:00; Su off")!;
    expect(h[1]).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(h[5]).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(h[6]).toEqual([{ open: "10:00", close: "16:00" }]);
    expect(h[0]).toEqual([]);
  });
  it("reads 24/7 and Mo-Su", () => {
    expect(fromOsm("24/7")![3]).toEqual([{ open: "00:00", close: "24:00" }]);
    const h = fromOsm("Mo-Su 10:00-18:00")!;
    for (const d of [0, 1, 2, 3, 4, 5, 6] as const) expect(h[d]).toEqual([{ open: "10:00", close: "18:00" }]);
  });
  it("ignores PH off, reads day lists, split times and a later override", () => {
    const h = fromOsm("Mo,We 10:00-12:00,13:00-16:00; PH off")!;
    expect(h[1]).toHaveLength(2);
    expect(h[3][1]).toEqual({ open: "13:00", close: "16:00" });
    expect(h[2]).toEqual([]);
    const o = fromOsm("Mo-Su 09:00-17:00; Tu off")!;
    expect(o[2]).toEqual([]);
    expect(o[1]).toHaveLength(1);
  });
  it("reads a wrapping day range and a past-midnight close", () => {
    const h = fromOsm("Fr-Su 18:00-02:00")!;
    expect(h[5]).toEqual([{ open: "18:00", close: "02:00" }]);
    expect(h[0]).toEqual([{ open: "18:00", close: "02:00" }]);
    expect(h[1]).toEqual([]);
    expect(fromOsm("Sa 20:00-26:00")![6]).toEqual([{ open: "20:00", close: "02:00" }]);
  });
  it("returns null for what it cannot read", () => {
    expect(fromOsm("Apr-Oct Mo-Su 10:00-17:00")).toBeNull();
    expect(fromOsm("Mo-Fr 10:00+")).toBeNull();
    expect(fromOsm("sunrise-sunset")).toBeNull();
    expect(fromOsm("PH off")).toBeNull();
    expect(fromOsm("")).toBeNull();
  });
});

describe("fromSchemaOrg", () => {
  it("reads day names, schema URLs and arrays; 23:59 is midnight", () => {
    const h = fromSchemaOrg([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "https://schema.org/Tuesday"], opens: "09:00:00", closes: "17:30:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "http://schema.org/Saturday", opens: "10:00", closes: "23:59" },
    ])!;
    expect(h[1]).toEqual([{ open: "09:00", close: "17:30" }]);
    expect(h[2]).toEqual([{ open: "09:00", close: "17:30" }]);
    expect(h[6]).toEqual([{ open: "10:00", close: "24:00" }]);
    expect(h[0]).toEqual([]);
  });
  it("treats 00:00–00:00 as closed and nothing usable as null", () => {
    expect(fromSchemaOrg({ dayOfWeek: "Sunday", opens: "00:00", closes: "00:00" })).toBeNull();
    expect(fromSchemaOrg([{ dayOfWeek: "Sunday" }])).toBeNull();
    expect(fromSchemaOrg("nope")).toBeNull();
  });
});

describe("fromGooglePlaces", () => {
  it("reads Places (New) periods", () => {
    const h = fromGooglePlaces([
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
      { open: { day: 6, hour: 10, minute: 30 }, close: { day: 6, hour: 16, minute: 0 } },
    ])!;
    expect(h[1]).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(h[6]).toEqual([{ open: "10:30", close: "16:00" }]);
  });
  it("keeps a close past midnight as one span, midnight as 24:00, and no close as 24/7", () => {
    const h = fromGooglePlaces([
      { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
      { open: { day: 4, time: "1000" }, close: { day: 5, time: "0000" } },
    ])!;
    expect(h[5]).toEqual([{ open: "18:00", close: "02:00" }]);
    expect(h[4]).toEqual([{ open: "10:00", close: "24:00" }]);
    expect(fromGooglePlaces([{ open: { day: 0, hour: 0, minute: 0 } }])![2]).toEqual([{ open: "00:00", close: "24:00" }]);
    expect(fromGooglePlaces([])).toBeNull();
  });
});

describe("isOpenAt / isOpenFor", () => {
  const late = fromOsm("Fr 18:00-02:00; Sa 10:00-16:00")!;
  it("reads a past-midnight close on the next day", () => {
    expect(isOpenAt(late, 5, "23:30")).toBe(true);
    expect(isOpenAt(late, 6, "01:30")).toBe(true);
    expect(isOpenAt(late, 6, "02:00")).toBe(false);
    expect(isOpenAt(late, 6, "09:00")).toBe(false);
    expect(isOpenAt(late, 6, "10:00")).toBe(true);
  });
  it("checks a whole span in London time (BST)", () => {
    // Friday 3 July 2026, 19:00 BST = 18:00 UTC; Saturday 01:30 BST = 00:30 UTC.
    const start = Date.UTC(2026, 6, 3, 18, 0);
    expect(londonWeekdayMinute(start)).toEqual({ day: 5, minute: 19 * 60 });
    expect(isOpenFor(late, start, Date.UTC(2026, 6, 4, 0, 30))).toBe(true);
    expect(isOpenFor(late, start, Date.UTC(2026, 6, 4, 1, 30))).toBe(false); // to 02:30 BST
  });
  it("stitches adjoining spans and fails across a gap", () => {
    const split = fromOsm("Mo 09:00-12:00,12:00-17:00,18:00-20:00")!;
    // Monday 16 November 2026 (GMT)
    expect(isOpenFor(split, Date.UTC(2026, 10, 16, 10), Date.UTC(2026, 10, 16, 16))).toBe(true);
    expect(isOpenFor(split, Date.UTC(2026, 10, 16, 16), Date.UTC(2026, 10, 16, 19))).toBe(false);
  });
  it("is open across days for 24/7", () => {
    expect(isOpenFor(fromOsm("24/7")!, Date.UTC(2026, 10, 16, 10), Date.UTC(2026, 10, 19, 10))).toBe(true);
  });
});
