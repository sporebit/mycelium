import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dueJobs, SCHEDULE, SLOT_MINUTES } from "./schedule";

const at = (h: number, m: number) => dueJobs(h * 60 + m).map((j) => j.path.replace("/api/cron/", "")).filter((p) => !p.startsWith("/api/briefings"));

describe("the sub-daily schedule", () => {
  it("every interval is a whole number of slots", () => {
    for (const job of SCHEDULE) expect(job.everyMinutes % SLOT_MINUTES, job.path).toBe(0);
  });

  it("on the hour, in the evening, everything is due", () => {
    expect(at(21, 0)).toEqual(["daylog", "daily-prompts", "reminders", "tickets-checkins", "family", "quotes-research", "rundowns"]);
  });

  it("any minute inside a slot gives that slot's jobs", () => {
    expect(at(21, 3)).toEqual(at(21, 0));
    expect(at(21, 4)).toEqual(at(21, 0));
    expect(at(21, 5)).toEqual(["daily-prompts", "reminders"]);
  });

  it("quarter and half hours", () => {
    expect(at(21, 15)).toEqual(["daylog", "daily-prompts", "reminders", "tickets-checkins", "family"]);
    expect(at(21, 30)).toEqual(["daylog", "daily-prompts", "reminders", "tickets-checkins", "family", "quotes-research"]);
  });

  it("the daily prompts rest from midnight to six; reminders never do", () => {
    expect(at(3, 5)).toEqual(["reminders"]);
    expect(at(5, 55)).toEqual(["reminders"]);
    expect(at(6, 5)).toEqual(["daily-prompts", "reminders"]);
  });

  it("the morning briefing is offered from seven to ten, before the daily prompts", () => {
    const jobs = dueJobs(7 * 60 + 5).map((j) => j.path);
    expect(jobs.indexOf("/api/briefings/morning")).toBe(0);
    expect(jobs).toContain("/api/cron/daily-prompts");
    expect(dueJobs(6 * 60 + 55).map((j) => j.path)).not.toContain("/api/briefings/morning");
    expect(dueJobs(10 * 60).map((j) => j.path)).not.toContain("/api/briefings/morning");
  });

  it("the Day log runs from six in the evening to four in the morning", () => {
    expect(at(17, 45)).not.toContain("daylog");
    expect(at(18, 0)).toContain("daylog");
    expect(at(23, 45)).toContain("daylog");
    expect(at(3, 45)).toContain("daylog");
    expect(at(4, 0)).not.toContain("daylog");
    expect(at(12, 0)).not.toContain("daylog");
  });

  it("the AI model list is read once a day, at five in the morning, and never sub-daily", () => {
    expect(at(5, 0)).toContain("ai-models");
    expect(at(5, 5)).not.toContain("ai-models");
    expect(at(5, 30)).not.toContain("ai-models");
    expect(at(6, 0)).not.toContain("ai-models");
    expect(at(21, 0)).not.toContain("ai-models");
    const hits = Array.from({ length: 24 * 12 }, (_, i) => at(Math.floor((i * 5) / 60), (i * 5) % 60)).filter((j) => j.includes("ai-models"));
    expect(hits).toHaveLength(1);
  });

  it("every scheduled job has a handler in the tick (a job in the table with nothing to run it answers 500 every time it is due)", () => {
    const tick = readFileSync(path.resolve(process.cwd(), "app/api/cron/tick/route.ts"), "utf8");
    for (const job of SCHEDULE) expect(tick, job.path).toContain(`"${job.path}": `);
  });
});
