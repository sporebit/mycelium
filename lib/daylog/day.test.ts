import { describe, expect, it } from "vitest";
import { daylogDay, londonClock, shiftDate } from "./day";

describe("day boundary (Europe/London, cutoff 03:00)", () => {
  it("00:30 BST belongs to the evening before", () => {
    // 2026-07-15 23:30Z = 2026-07-16 00:30 BST
    expect(daylogDay(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-15");
  });
  it("03:00 BST starts the new day", () => {
    expect(daylogDay(new Date("2026-07-16T02:00:00Z"))).toBe("2026-07-16");
  });
  it("21:30 GMT in winter is the same day", () => {
    expect(daylogDay(new Date("2026-01-10T21:30:00Z"))).toBe("2026-01-10");
    expect(londonClock(new Date("2026-01-10T21:30:00Z")).minutes).toBe(21 * 60 + 30);
  });
  it("shiftDate crosses month ends", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});
