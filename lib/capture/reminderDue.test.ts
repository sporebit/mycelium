import { describe, expect, it } from "vitest";
import { reminderDueIso } from "./reminderDue";

// 2026-11-20 is a Friday; London is on GMT, so wall clock = UTC.
const NOON = new Date("2026-11-20T12:00:00Z");

describe("when a reminder is due", () => {
  it("in 30 minutes", () => {
    expect(reminderDueIso({ relative_minutes: 30 }, NOON)).toBe("2026-11-20T12:30:00.000Z");
  });
  it("tomorrow at 9", () => {
    expect(reminderDueIso({ date: "tomorrow", time: "09:00" }, NOON)).toBe("2026-11-21T09:00:00.000Z");
  });
  it("today at 8pm, and a bare time later today", () => {
    expect(reminderDueIso({ date: "today", time: "20:00" }, NOON)).toBe("2026-11-20T20:00:00.000Z");
    expect(reminderDueIso({ date: null, time: "20:00" }, NOON)).toBe("2026-11-20T20:00:00.000Z");
  });
  it("a time already gone today means tomorrow, unless it repeats", () => {
    expect(reminderDueIso({ date: "today", time: "08:00" }, NOON)).toBe("2026-11-21T08:00:00.000Z");
    expect(reminderDueIso({ date: "today", time: "08:00", recurrence: "daily" }, NOON)).toBe("2026-11-20T08:00:00.000Z");
  });
  it("a day of the week is the next one, never today", () => {
    expect(reminderDueIso({ date: "monday", time: "15:00" }, NOON)).toBe("2026-11-23T15:00:00.000Z");
    expect(reminderDueIso({ date: "Friday", time: "15:00" }, NOON)).toBe("2026-11-27T15:00:00.000Z");
  });
  it("a calendar date, with 09:00 when no time came with it", () => {
    expect(reminderDueIso({ date: "2031-01-15", time: "09:30" }, NOON)).toBe("2031-01-15T09:30:00.000Z");
    expect(reminderDueIso({ date: "2031-01-15" }, NOON)).toBe("2031-01-15T09:00:00.000Z");
  });
  it("London summer time is an hour ahead of UTC", () => {
    expect(reminderDueIso({ date: "tomorrow", time: "09:00" }, new Date("2026-07-01T12:00:00Z"))).toBe("2026-07-02T08:00:00.000Z");
  });
  it("no time and no delay: nothing to set, the card asks", () => {
    expect(reminderDueIso({ date: "tomorrow", time: null }, NOON)).toBeNull();
    expect(reminderDueIso({ date: null, time: null, relative_minutes: null }, NOON)).toBeNull();
    expect(reminderDueIso({ date: "today", time: "8pm" }, NOON)).toBeNull();
  });
});
