import { describe, expect, it } from "vitest";
import { decide, type DecideInput, isQuietAt, minutesOf, wordingKey } from "./budget";

const base: DecideInput = {
  origin: "app",
  minutesNow: minutesOf("14:00"),
  quietFrom: "22:00",
  quietTo: "07:00",
  timerRunning: false,
  countedToday: 0,
  budget: 3,
  recentUnanswered: [],
};

describe("quiet hours", () => {
  it("handles a window that runs over midnight", () => {
    expect(isQuietAt(minutesOf("23:30"), "22:00", "07:00")).toBe(true);
    expect(isQuietAt(minutesOf("02:00"), "22:00", "07:00")).toBe(true);
    expect(isQuietAt(minutesOf("06:59"), "22:00", "07:00")).toBe(true);
    expect(isQuietAt(minutesOf("07:00"), "22:00", "07:00")).toBe(false);
    expect(isQuietAt(minutesOf("21:59"), "22:00", "07:00")).toBe(false);
  });
  it("handles a window inside one day, and no window at all", () => {
    expect(isQuietAt(minutesOf("13:30"), "13:00", "14:00")).toBe(true);
    expect(isQuietAt(minutesOf("14:00"), "13:00", "14:00")).toBe(false);
    expect(isQuietAt(minutesOf("03:00"), "00:00", "00:00")).toBe(false);
  });
});

describe("decide — one budget of three a day (rule 26)", () => {
  it("allows the first three app-started interruptions and counts each", () => {
    for (const n of [0, 1, 2]) expect(decide({ ...base, countedToday: n })).toEqual({ allow: true, counted: true });
  });
  it("refuses the fourth", () => {
    expect(decide({ ...base, countedToday: 3 })).toEqual({ allow: false, reason: "budget" });
  });
  it("is one budget whatever the channel: the count is all that matters", () => {
    // Two pushes and a Telegram message already today: the wall may not speak.
    expect(decide({ ...base, countedToday: 3 }).allow).toBe(false);
  });
  it("a budget of nought silences everything the app starts", () => {
    expect(decide({ ...base, budget: 0 })).toEqual({ allow: false, reason: "budget" });
  });
});

describe("decide — what never counts", () => {
  it("a nudge from a person always goes through, at any hour, and is not counted", () => {
    const late = { ...base, origin: "person" as const, minutesNow: minutesOf("23:30"), countedToday: 9, timerRunning: true };
    expect(decide(late)).toEqual({ allow: true, counted: false });
  });
  it("a reply to something the person started is not counted", () => {
    expect(decide({ ...base, origin: "reply", countedToday: 3 })).toEqual({ allow: true, counted: false });
  });
});

describe("decide — when the app stays quiet", () => {
  it("nothing in quiet hours", () => {
    expect(decide({ ...base, minutesNow: minutesOf("23:00") })).toEqual({ allow: false, reason: "quiet" });
  });
  it("nothing while a focus timer runs (rule 27)", () => {
    expect(decide({ ...base, timerRunning: true })).toEqual({ allow: false, reason: "focus" });
  });
  it("not the same nudge in the same words again", () => {
    const w = wordingKey("chase", "Next up: boiler quote.", "t1");
    expect(decide({ ...base, wording: w, recentUnanswered: [w] })).toEqual({ allow: false, reason: "repeat" });
    expect(decide({ ...base, wording: wordingKey("chase", "Boiler quote: 5 minutes to find the email.", "t1"), recentUnanswered: [w] }).allow).toBe(true);
  });
});

describe("decide — the two prompts the loop is built on", () => {
  it("are sent even when other things spent the budget, and still count", () => {
    expect(decide({ ...base, countedToday: 3, essential: true })).toEqual({ allow: true, counted: true });
  });
  it("are not held back by the same-words rule: the same first task two mornings running is still a morning", () => {
    const w = wordingKey("morning", "Next up: boiler quote.", "t1");
    expect(decide({ ...base, essential: true, wording: w, recentUnanswered: [w] })).toEqual({ allow: true, counted: true });
  });
  it("something sent at a time the person chose is not stopped by the default quiet hours, but waits for a focus timer", () => {
    expect(decide({ ...base, atChosenTime: true, minutesNow: minutesOf("22:30") })).toEqual({ allow: true, counted: true });
    expect(decide({ ...base, atChosenTime: true, minutesNow: minutesOf("22:30"), timerRunning: true })).toEqual({ allow: false, reason: "focus" });
  });
  it("still wait for quiet hours and a focus timer", () => {
    expect(decide({ ...base, essential: true, minutesNow: minutesOf("06:00") })).toEqual({ allow: false, reason: "quiet" });
    expect(decide({ ...base, essential: true, timerRunning: true })).toEqual({ allow: false, reason: "focus" });
  });
});

describe("wordingKey", () => {
  it("treats punctuation and case as the same words, and a different ticket as different", () => {
    expect(wordingKey("chase", "Next up: Boiler quote!", "t1")).toBe(wordingKey("chase", "next up boiler quote", "t1"));
    expect(wordingKey("chase", "Next up: Boiler quote", "t1")).not.toBe(wordingKey("chase", "Next up: Boiler quote", "t2"));
  });
});
