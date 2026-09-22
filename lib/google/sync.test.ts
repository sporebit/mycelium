import { describe, expect, it } from "vitest";
import { ticketCalendarEvent } from "./sync";

const base = { id: "t1", title: "Dentist", description: "check-up" };

describe("ticketCalendarEvent (MYC-40)", () => {
  it("a dated ticket is an all-day event ending the next day", () => {
    expect(ticketCalendarEvent({ ...base, scheduled_on: "2026-09-30" })).toEqual({ summary: "Dentist", description: "check-up", start: { date: "2026-09-30" }, end: { date: "2026-10-01" } });
    expect(ticketCalendarEvent({ ...base, scheduled_on: "2026-12-31" })!.end).toEqual({ date: "2027-01-01" });
  });
  it("a timed ticket is a one-hour event, and the time wins over the date", () => {
    const e = ticketCalendarEvent({ ...base, scheduled_at: "2026-09-30T09:00:00.000Z", scheduled_on: "2026-09-30" })!;
    expect(e.start).toEqual({ dateTime: "2026-09-30T09:00:00.000Z", timeZone: "Europe/London" });
    expect(e.end).toEqual({ dateTime: "2026-09-30T10:00:00.000Z", timeZone: "Europe/London" });
  });
  it("undated, done, cancelled or completed → no event", () => {
    expect(ticketCalendarEvent({ ...base })).toBeNull();
    expect(ticketCalendarEvent({ ...base, scheduled_on: "2026-09-30", category: "done" })).toBeNull();
    expect(ticketCalendarEvent({ ...base, scheduled_on: "2026-09-30", category: "cancelled" })).toBeNull();
    expect(ticketCalendarEvent({ ...base, scheduled_on: "2026-09-30", completed_at: "2026-09-29T00:00:00Z" })).toBeNull();
  });
  it("a missing description is an empty one", () => {
    expect(ticketCalendarEvent({ id: "t2", title: "x", scheduled_on: "2026-09-30" })!.description).toBe("");
  });
});
