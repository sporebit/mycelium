import { describe, expect, it } from "vitest";
import { dueJobs, SCHEDULE, SLOT_MINUTES } from "./schedule";

const at = (h: number, m: number) => dueJobs(h * 60 + m).map((j) => j.path.replace("/api/cron/", ""));

describe("the sub-daily schedule", () => {
  it("every interval is a whole number of slots", () => {
    for (const job of SCHEDULE) expect(job.everyMinutes % SLOT_MINUTES, job.path).toBe(0);
  });

  it("on the hour, in the evening, everything is due", () => {
    expect(at(21, 0)).toEqual(["daily-prompts", "reminders", "tickets-checkins", "daylog", "quotes-research", "rundowns"]);
  });

  it("any minute inside a slot gives that slot's jobs", () => {
    expect(at(21, 3)).toEqual(at(21, 0));
    expect(at(21, 4)).toEqual(at(21, 0));
    expect(at(21, 5)).toEqual(["daily-prompts", "reminders"]);
  });

  it("quarter and half hours", () => {
    expect(at(21, 15)).toEqual(["daily-prompts", "reminders", "tickets-checkins", "daylog"]);
    expect(at(21, 30)).toEqual(["daily-prompts", "reminders", "tickets-checkins", "daylog", "quotes-research"]);
  });

  it("the daily prompts rest from midnight to six; reminders never do", () => {
    expect(at(3, 5)).toEqual(["reminders"]);
    expect(at(5, 55)).toEqual(["reminders"]);
    expect(at(6, 5)).toEqual(["daily-prompts", "reminders"]);
  });

  it("the Day log runs from six in the evening to four in the morning", () => {
    expect(at(17, 45)).not.toContain("daylog");
    expect(at(18, 0)).toContain("daylog");
    expect(at(23, 45)).toContain("daylog");
    expect(at(3, 45)).toContain("daylog");
    expect(at(4, 0)).not.toContain("daylog");
    expect(at(12, 0)).not.toContain("daylog");
  });
});
