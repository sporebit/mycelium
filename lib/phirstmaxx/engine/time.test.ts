import { describe, expect, it } from "vitest";
import { addLondonDays, eachLondonDay, londonDate, londonTime, londonWeekStart } from "./time";

const iso = (ms: number) => new Date(ms).toISOString();

describe("londonTime / londonDate", () => {
  it("maps BST wall clock to UTC", () => {
    expect(iso(londonTime("2026-08-21", "18:30"))).toBe("2026-08-21T17:30:00.000Z");
  });
  it("maps GMT wall clock to UTC", () => {
    expect(iso(londonTime("2026-12-21", "18:30"))).toBe("2026-12-21T18:30:00.000Z");
  });
  it("rolls the London date correctly at 23:30Z in summer", () => {
    expect(londonDate(new Date("2026-08-20T23:30:00Z"))).toBe("2026-08-21");
  });
});

describe("DST changeover days", () => {
  it("29 March 2026 is 23 hours long", () => {
    const start = londonTime("2026-03-29", "00:00");
    const next = londonTime("2026-03-30", "00:00");
    expect((next - start) / 3_600_000).toBe(23);
  });
  it("25 October 2026 is 25 hours long", () => {
    const start = londonTime("2026-10-25", "00:00");
    const next = londonTime("2026-10-26", "00:00");
    expect((next - start) / 3_600_000).toBe(25);
  });
  it("addLondonDays steps whole calendar days across both changeovers", () => {
    expect(addLondonDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addLondonDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addLondonDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addLondonDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("reads the missing March hour forward and the repeated October hour as GMT", () => {
    expect(iso(londonTime("2026-03-29", "01:30"))).toBe("2026-03-29T01:30:00.000Z");
    expect(iso(londonTime("2026-03-29", "02:00"))).toBe("2026-03-29T01:00:00.000Z");
    expect(iso(londonTime("2026-10-25", "01:30"))).toBe("2026-10-25T01:30:00.000Z");
    expect(iso(londonTime("2026-10-25", "00:30"))).toBe("2026-10-24T23:30:00.000Z");
  });
});

describe("eachLondonDay", () => {
  it("lists every day a range touches, end exclusive", () => {
    expect(
      eachLondonDay(
        new Date("2026-08-20T23:30:00Z"), // 21 Aug London
        new Date("2026-08-23T23:00:00Z"), // 24 Aug 00:00 London, exclusive
      ),
    ).toEqual(["2026-08-21", "2026-08-22", "2026-08-23"]);
  });
});

describe("londonWeekStart", () => {
  it("returns the Monday", () => {
    expect(londonWeekStart("2026-08-21")).toBe("2026-08-17"); // Friday to Monday
    expect(londonWeekStart("2026-08-17")).toBe("2026-08-17");
    expect(londonWeekStart("2026-08-23")).toBe("2026-08-17"); // Sunday
  });
});
