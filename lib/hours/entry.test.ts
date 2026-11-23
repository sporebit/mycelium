import { describe, expect, it } from "vitest";
import { MAX_IDS, defaultEntryDate, readEntryInput, readIdList, readMinutes } from "./entry";

describe("readMinutes", () => {
  it("accepts minutes, durations and empties", () => {
    expect(readMinutes(45)).toBe(45);
    expect(readMinutes("0:45")).toBe(45);
    expect(readMinutes("1.5h")).toBe(90);
    expect(readMinutes("")).toBeNull();
    expect(readMinutes(null)).toBeNull();
  });
  it("rejects out-of-range and junk", () => {
    expect(readMinutes(1441)).toBeUndefined();
    expect(readMinutes(-1)).toBeUndefined();
    expect(readMinutes(1.5)).toBeUndefined();
    expect(readMinutes("abc")).toBeUndefined();
    expect(readMinutes(true)).toBeUndefined();
  });
});

describe("readEntryInput create", () => {
  it("fills defaults and derives the ticket key", () => {
    const r = readEntryInput({ entry_date: "2026-11-19", minutes: "0:45", description: " Standup ", ticket: "https://x.atlassian.net/browse/ABC-12?x=1" }, "create");
    expect(r).toEqual({
      ok: true,
      fields: {
        entry_date: "2026-11-19",
        minutes: 45,
        estimate_minutes: null,
        description: "Standup",
        ticket_raw: "https://x.atlassian.net/browse/ABC-12?x=1",
        ticket_key: "ABC-12",
        logged: false,
      },
    });
  });
  it("allows an open item with no date or time", () => {
    const r = readEntryInput({ description: "Write the report", estimate_minutes: 120 }, "create");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.entry_date).toBeNull();
      expect(r.fields.minutes).toBeNull();
      expect(r.fields.estimate_minutes).toBe(120);
    }
  });
  it("rejects an empty row and bad values", () => {
    expect(readEntryInput({}, "create")).toEqual({ ok: false, error: "An entry needs a time, a description or a ticket." });
    expect(readEntryInput({ minutes: 0 }, "create").ok).toBe(true);
    expect(readEntryInput({ entry_date: "19/11/2026", minutes: 10 }, "create").ok).toBe(false);
    expect(readEntryInput({ minutes: "25:00" }, "create").ok).toBe(false);
    expect(readEntryInput({ logged: "x", minutes: 10 }, "create").ok).toBe(false);
    expect(readEntryInput(null, "create").ok).toBe(false);
  });
});

describe("readEntryInput patch", () => {
  it("returns only the keys sent", () => {
    expect(readEntryInput({ logged: true }, "patch")).toEqual({ ok: true, fields: { logged: true } });
    expect(readEntryInput({ ticket_raw: "abc-7" }, "patch")).toEqual({ ok: true, fields: { ticket_raw: "abc-7", ticket_key: "ABC-7" } });
    expect(readEntryInput({ minutes: "" }, "patch")).toEqual({ ok: true, fields: { minutes: null } });
  });
  it("refuses an empty patch", () => {
    expect(readEntryInput({}, "patch")).toEqual({ ok: false, error: "Nothing to change." });
  });
});

describe("defaultEntryDate", () => {
  it("is the date of the most recently created dated live entry, else today", () => {
    const entries = [
      { entry_date: "2026-11-17", created_at: "2026-11-17T10:00:00Z", deleted_at: null },
      { entry_date: "2026-11-12", created_at: "2026-11-18T09:00:00Z", deleted_at: null },
      { entry_date: "2026-11-19", created_at: "2026-11-19T09:00:00Z", deleted_at: "2026-11-19T10:00:00Z" },
      { entry_date: null, created_at: "2026-11-19T11:00:00Z", deleted_at: null },
    ];
    expect(defaultEntryDate(entries, "2026-11-20")).toBe("2026-11-12");
    expect(defaultEntryDate([], "2026-11-20")).toBe("2026-11-20");
  });
});

describe("readIdList", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  it("takes a list of uuids, lower-cased and without duplicates", () => {
    expect(readIdList({ ids: [a, b.toUpperCase(), a] })).toEqual({ ok: true, ids: [a, b] });
  });
  it("refuses no body, no list, an empty list, a non-uuid and too many", () => {
    expect(readIdList(null).ok).toBe(false);
    expect(readIdList({ ids: "x" }).ok).toBe(false);
    expect(readIdList({ ids: [] })).toEqual({ ok: false, error: "Nothing selected." });
    expect(readIdList({ ids: [a, "tmp-1"] }).ok).toBe(false);
    expect(readIdList({ ids: [a, 7] }).ok).toBe(false);
    const many = Array.from({ length: MAX_IDS + 1 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`);
    expect(readIdList({ ids: many }).ok).toBe(false);
  });
});
