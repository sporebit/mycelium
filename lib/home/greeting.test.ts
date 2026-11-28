import { describe, expect, it } from "vitest";
import { dayPart, greeting, hourOf, londonHour } from "./greeting";

describe("the greeting by time of day", () => {
  it("splits the day at four, noon and six", () => {
    expect(dayPart(3)).toBe("evening");
    expect(dayPart(4)).toBe("morning");
    expect(dayPart(11)).toBe("morning");
    expect(dayPart(12)).toBe("afternoon");
    expect(dayPart(17)).toBe("afternoon");
    expect(dayPart(18)).toBe("evening");
    expect(dayPart(23)).toBe("evening");
  });

  it("names the person when there is a name, and nobody when there is not", () => {
    expect(greeting(7, "Phil")).toBe("Good morning, Phil");
    expect(greeting(19, null)).toBe("Good evening");
    expect(greeting(14, "  ")).toBe("Good afternoon");
    expect(greeting(14, "You")).toBe("Good afternoon");
  });

  it("reads the hour from a drawn-at clock", () => {
    expect(hourOf("05:31")).toBe(5);
    expect(hourOf("23:00")).toBe(23);
    expect(hourOf("late")).toBeNull();
    expect(hourOf("25:00")).toBeNull();
  });

  it("uses London's hour", () => {
    expect(londonHour(new Date("2026-07-01T06:30:00Z"))).toBe(7);
    expect(londonHour(new Date("2026-12-01T06:30:00Z"))).toBe(6);
  });
});
