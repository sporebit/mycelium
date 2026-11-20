import { describe, expect, it } from "vitest";
import { looksLikeHeader, readDate, readDurationCell, readPaste, readTable, splitPaste } from "./paste";

describe("readDate", () => {
  it("reads ISO, UK, short-year, named-month, Excel serial and Date cells", () => {
    expect(readDate("2026-11-19")).toBe("2026-11-19");
    expect(readDate("19/11/2026")).toBe("2026-11-19");
    expect(readDate("19/11/26")).toBe("2026-11-19");
    expect(readDate("19-11-2026 00:00")).toBe("2026-11-19");
    expect(readDate("19 Nov 2026")).toBe("2026-11-19");
    expect(readDate(46345)).toBe("2026-11-19");
    expect(readDate(new Date("2026-11-19T00:00:00Z"))).toBe("2026-11-19");
    expect(readDate("")).toBeNull();
    expect(readDate("yesterday")).toBeUndefined();
    expect(readDate("31/02/2026")).toBeUndefined();
  });
});

describe("readDurationCell", () => {
  it("reads h:mm text, decimal hours, Excel fractions and empties", () => {
    expect(readDurationCell("0:45")).toBe(45);
    expect(readDurationCell("1.5")).toBe(90);
    expect(readDurationCell(0.03125)).toBe(45);
    expect(readDurationCell(45)).toBe(45);
    expect(readDurationCell(new Date("1899-12-30T00:45:00Z"))).toBe(45);
    expect(readDurationCell("")).toBeNull();
    expect(readDurationCell("lots")).toBeUndefined();
  });
});

describe("splitPaste / looksLikeHeader", () => {
  it("splits tab-separated Excel copies and quoted CSV", () => {
    expect(splitPaste("Date\tTime Spent\tDescription\n2026-11-19\t0:45\tStandup\n")).toEqual([
      ["Date", "Time Spent", "Description"],
      ["2026-11-19", "0:45", "Standup"],
    ]);
    expect(splitPaste('2026-11-19,0:45,"Review, then merge",ABC-1,x')).toEqual([["2026-11-19", "0:45", "Review, then merge", "ABC-1", "x"]]);
  });
  it("spots the workbook header", () => {
    expect(looksLikeHeader(["Date", "Time Spent", "Estimate", "Description", "Ticket", "Logged"])).toBe(true);
    expect(looksLikeHeader(["2026-11-19", "0:45", "", "Standup", "ABC-1", "x"])).toBe(false);
  });
});

describe("readTable", () => {
  it("maps by header in any order and understands the export's extra columns", () => {
    const r = readTable([
      ["Description", "Ticket", "Logged", "Date", "Minutes", "Entry ID"],
      ["Standup", "ABC-1", "x", "19/11/2026", 45, "6f1c2a3e-1111-4222-8333-444455556666"],
      ["Open item", "", "", "", "", ""],
    ]);
    expect(r.rejected).toEqual([]);
    expect(r.file.logEntries).toEqual([
      { id: "6f1c2a3e-1111-4222-8333-444455556666", sourceRow: null, date: "2026-11-19", minutes: 45, estimateMinutes: null, description: "Standup", ticketRaw: "ABC-1", logged: true },
      { id: null, sourceRow: null, date: null, minutes: null, estimateMinutes: null, description: "Open item", ticketRaw: "", logged: false },
    ]);
  });
  it("assumes the workbook order without a header and rejects unreadable rows by position", () => {
    const r = readPaste("2026-11-19\t0:45\t\tStandup\tABC-1\tx\nnot a date\t0:30\t\tx\t\t\n2026-11-19\t9h99\t\tBad time\t\t\n\t\t\t\t\t\n2026-11-20\t\t2:00\tPlan the thing\tABC-2\t");
    expect(r.rejected).toEqual([
      { row: 2, reason: 'Date "not a date" not understood.' },
      { row: 3, reason: 'Time Spent "9h99" not understood.' },
    ]);
    expect(r.file.logEntries).toHaveLength(2);
    expect(r.file.logEntries[1]).toMatchObject({ date: "2026-11-20", minutes: null, estimateMinutes: 120, description: "Plan the thing", ticketRaw: "ABC-2", logged: false });
  });
  it("needs Date, a time column and Description", () => {
    const r = readTable([["Date", "Ticket"], ["2026-11-19", "ABC-1"]]);
    expect(r.rejected[0].reason).toMatch(/Need at least/);
    expect(r.file.logEntries).toEqual([]);
  });
});
