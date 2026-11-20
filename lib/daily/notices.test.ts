import { describe, expect, it } from "vitest";
import { decide } from "@/lib/nudges/budget";
import { dueNotices, londonInstant, noticeKey, type Switch } from "./notices";
import { bannedIn, closeoutNotice, switchNotice, timerNotice } from "./words";

const dentist: Switch = { id: "t1", title: "Dentist", at: "2026-11-20T14:00:00Z", kind: "ticket" };
const closeout: Switch = { id: "closeout", title: "The week's close-out", at: "2026-11-22T18:00:00Z", kind: "closeout" };

describe("notices before a scheduled switch (research rule 27)", () => {
  it("is due about ten minutes out, then about two, once each, with the true gap", () => {
    const none = new Set<string>();
    expect(dueNotices([dentist], new Date("2026-11-20T13:45:00Z"), none)).toEqual([]);
    expect(dueNotices([dentist], new Date("2026-11-20T13:50:00Z"), none)).toEqual([{ switch: dentist, stage: 10, minutes: 10 }]);
    expect(dueNotices([dentist], new Date("2026-11-20T13:52:00Z"), none)).toEqual([{ switch: dentist, stage: 10, minutes: 8 }]);
    expect(dueNotices([dentist], new Date("2026-11-20T13:55:00Z"), none)).toEqual([{ switch: dentist, stage: 2, minutes: 5 }]);
    expect(dueNotices([dentist], new Date("2026-11-20T13:58:00Z"), none)).toEqual([{ switch: dentist, stage: 2, minutes: 2 }]);
    expect(dueNotices([dentist], new Date("2026-11-20T14:00:00Z"), none)).toEqual([]);
    expect(dueNotices([dentist], new Date("2026-11-20T14:05:00Z"), none)).toEqual([]);
  });

  it("does not say the same stage twice, and still says the late one if the early one never went", () => {
    const sent = new Set([noticeKey("t1", 10)]);
    expect(dueNotices([dentist], new Date("2026-11-20T13:52:00Z"), sent)).toEqual([]);
    expect(dueNotices([dentist], new Date("2026-11-20T13:57:00Z"), sent)).toEqual([{ switch: dentist, stage: 2, minutes: 3 }]);
    const both = new Set([noticeKey("t1", 10), noticeKey("t1", 2)]);
    expect(dueNotices([dentist], new Date("2026-11-20T13:57:00Z"), both)).toEqual([]);
    // the ten-minute one was skipped by a tick that fell outside the window: the two-minute one still goes
    expect(dueNotices([dentist], new Date("2026-11-20T13:56:00Z"), new Set())).toEqual([{ switch: dentist, stage: 2, minutes: 4 }]);
  });

  it("handles several switches at once, one line each", () => {
    const due = dueNotices([dentist, closeout, { ...dentist, id: "t2", title: "School run", at: "2026-11-20T13:58:00Z" }], new Date("2026-11-20T13:51:00Z"), new Set());
    expect(due.map((d) => [d.switch.id, d.stage, d.minutes])).toEqual([
      ["t1", 10, 9],
      ["t2", 10, 7],
    ]);
  });

  it("turns a London day and time into the right instant in winter and summer", () => {
    expect(londonInstant("2026-11-20", "14:00")).toBe("2026-11-20T14:00:00.000Z");
    expect(londonInstant("2026-07-20", "14:00")).toBe("2026-07-20T13:00:00.000Z");
    expect(londonInstant("2026-07-20", "00:30:00")).toBe("2026-07-19T23:30:00.000Z");
  });

  it("goes while a focus timer runs, and only then differs from any other interruption", () => {
    const base = { origin: "app" as const, minutesNow: 14 * 60, quietFrom: "22:00", quietTo: "07:00", timerRunning: true, countedToday: 0, budget: 3, recentUnanswered: [] };
    expect(decide(base)).toEqual({ allow: false, reason: "focus" });
    expect(decide({ ...base, switchNotice: true })).toEqual({ allow: true, counted: true });
    // still inside the budget, still inside quiet hours, still never repeated
    expect(decide({ ...base, switchNotice: true, countedToday: 3 })).toEqual({ allow: false, reason: "budget" });
    expect(decide({ ...base, switchNotice: true, minutesNow: 23 * 60 })).toEqual({ allow: false, reason: "quiet" });
    expect(decide({ ...base, switchNotice: true, wording: "x", recentUnanswered: ["x"] })).toEqual({ allow: false, reason: "repeat" });
  });

  it("says each notice in the loop's words", () => {
    expect(switchNotice("Dentist", 8)).toEqual({ title: "Dentist in 8 min.", body: "Time to find a stopping place." });
    expect(switchNotice("Dentist", 2)).toEqual({ title: "Dentist in 2 min.", body: "Time to stop and switch." });
    expect(switchNotice("Dentist", 1).title).toBe("Dentist in a minute.");
    expect(closeoutNotice(10).title).toBe("The week's close-out starts in 10 min.");
    expect(timerNotice(10)).toBe("Ten minutes left.");
    expect(timerNotice(2)).toBe("Two minutes left. Find a stopping place.");
    expect(timerNotice(7)).toBeNull();
    for (const text of [switchNotice("A very long title that goes on and on about a thing that is scheduled for later today", 9).title, switchNotice("x", 1).body, closeoutNotice(3).body, timerNotice(2) ?? ""]) {
      expect(bannedIn(text), text).toBeNull();
    }
  });
});
