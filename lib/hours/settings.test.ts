import { describe, expect, it } from "vitest";
import { readAbsenceInput, readGovUkHolidays, readHolidayInput, readSettingsInput } from "./settings";

describe("readSettingsInput", () => {
  it("reads minutes as numbers or durations and trims text", () => {
    const r = readSettingsInput({ contracted_minutes_per_week: "37:30", standard_day_minutes: 450, checkpoint_threshold_minutes: "25h", ticket_base_url: " https://x.atlassian.net/browse ", block_out_recipients: "a@x.com, b@x.com\nc@x.com" });
    expect(r).toEqual({
      ok: true,
      fields: { contracted_minutes_per_week: 2250, standard_day_minutes: 450, checkpoint_threshold_minutes: 1500, ticket_base_url: "https://x.atlassian.net/browse", block_out_recipients: ["a@x.com", "b@x.com", "c@x.com"] },
    });
  });
  it("rejects out-of-range and malformed values", () => {
    expect(readSettingsInput({ standard_day_minutes: 0 }).ok).toBe(false);
    expect(readSettingsInput({ tracking_start: "2026-13-01" }).ok).toBe(false);
    expect(readSettingsInput({ ticket_base_url: "atlassian.net" }).ok).toBe(false);
    expect(readSettingsInput({ review_length_weeks: 0 }).ok).toBe(false);
    expect(readSettingsInput({})).toEqual({ ok: false, error: "Nothing to change." });
  });
  it("drops catch-all rows without a key and splits body text into lines", () => {
    const r = readSettingsInput({ catch_all_tickets: [{ key: " ABC-1 ", purpose: "admin" }, { key: "", purpose: "x" }], block_out_body_lines: "Hi,\n\nBye  " });
    expect(r).toEqual({ ok: true, fields: { catch_all_tickets: [{ key: "ABC-1", purpose: "admin" }], block_out_body_lines: ["Hi,", "", "Bye"] } });
  });
});

describe("readAbsenceInput", () => {
  it("defaults minutes to the standard day", () => {
    expect(readAbsenceInput({ absence_date: "2026-11-20", type: "Sick" }, 450)).toEqual({ ok: true, fields: { absence_date: "2026-11-20", type: "Sick", minutes: 450, note: "" } });
    expect(readAbsenceInput({ absence_date: "2026-11-20", type: "Annual leave", minutes: "3:45", note: " pm off " }, 450)).toEqual({ ok: true, fields: { absence_date: "2026-11-20", type: "Annual leave", minutes: 225, note: "pm off" } });
  });
  it("rejects unknown types and bad dates", () => {
    expect(readAbsenceInput({ absence_date: "2026-11-20", type: "Holiday" }, 450).ok).toBe(false);
    expect(readAbsenceInput({ absence_date: "20/11/2026", type: "Sick" }, 450).ok).toBe(false);
  });
});

describe("readHolidayInput / readGovUkHolidays", () => {
  it("reads a manual holiday", () => {
    expect(readHolidayInput({ holiday_date: "2026-12-25", name: "Christmas Day" })).toEqual({ ok: true, fields: { holiday_date: "2026-12-25", name: "Christmas Day" } });
  });
  it("takes England and Wales events from the gov.uk feed from a date", () => {
    const feed = {
      "england-and-wales": { division: "england-and-wales", events: [{ title: "New Year’s Day", date: "2026-01-01", notes: "", bunting: true }, { title: "Christmas Day", date: "2026-12-25", notes: "", bunting: true }] },
      scotland: { division: "scotland", events: [{ title: "2nd January", date: "2026-01-02" }] },
    };
    expect(readGovUkHolidays(feed, "2026-06-01")).toEqual([{ holiday_date: "2026-12-25", name: "Christmas Day" }]);
    expect(readGovUkHolidays({}, "2026-01-01")).toEqual([]);
  });
});
