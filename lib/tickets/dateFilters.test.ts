import { describe, expect, it } from "vitest";
import { formatLondonDateTime, londonDayBound, parseBound, parseDateRanges, parseSort } from "./dateFilters";

describe("dates list filters (tasks-merge M4)", () => {
  it("a bare date is a London day: BST and GMT edges", () => {
    // 2026-07-01 is BST (UTC+1)
    expect(londonDayBound("2026-07-01", "start")).toBe("2026-06-30T23:00:00.000Z");
    expect(londonDayBound("2026-07-01", "end")).toBe("2026-07-01T22:59:59.999Z");
    // 2026-01-15 is GMT
    expect(londonDayBound("2026-01-15", "start")).toBe("2026-01-15T00:00:00.000Z");
    expect(londonDayBound("2026-01-15", "end")).toBe("2026-01-15T23:59:59.999Z");
  });

  it("the clocks-change days resolve to the right instants", () => {
    // BST starts 2026-03-29 01:00 UTC: the day starts in GMT, ends in BST
    expect(londonDayBound("2026-03-29", "start")).toBe("2026-03-29T00:00:00.000Z");
    expect(londonDayBound("2026-03-29", "end")).toBe("2026-03-29T22:59:59.999Z");
    // BST ends 2026-10-25 01:00 UTC: the day starts in BST, ends in GMT
    expect(londonDayBound("2026-10-25", "start")).toBe("2026-10-24T23:00:00.000Z");
    expect(londonDayBound("2026-10-25", "end")).toBe("2026-10-25T23:59:59.999Z");
  });

  it("a full timestamp is taken as given; junk is dropped", () => {
    expect(parseBound("2026-09-25T10:00:00Z", "start")).toBe("2026-09-25T10:00:00.000Z");
    expect(parseBound("2026-09-25T10:00:00+01:00", "end")).toBe("2026-09-25T09:00:00.000Z");
    expect(parseBound("yesterday", "start")).toBeNull();
    expect(parseBound("2026-13-40", "start")).toBeNull();
    expect(parseBound("", "start")).toBeNull();
    expect(parseBound(null, "start")).toBeNull();
  });

  it("parses the four ranges from query params and ignores the rest", () => {
    const params = new URLSearchParams({
      created_from: "2026-09-01",
      created_to: "2026-09-30",
      started_from: "2026-09-10",
      completed_to: "2026-09-20",
      closed_from: "not a date",
      bogus_from: "2026-01-01",
    });
    const r = parseDateRanges((k) => params.get(k));
    expect(Object.keys(r).sort()).toEqual(["completed", "created", "started"]);
    expect(r.created).toEqual({ from: "2026-08-31T23:00:00.000Z", to: "2026-09-30T22:59:59.999Z" });
    expect(r.started).toEqual({ from: "2026-09-09T23:00:00.000Z", to: null });
    expect(r.completed).toEqual({ from: null, to: "2026-09-20T22:59:59.999Z" });
    expect(r.closed).toBeUndefined();
  });

  it("only whitelisted sort columns pass; dir defaults per column", () => {
    expect(parseSort("started_at", "asc")).toEqual({ column: "started_at", dir: "asc" });
    expect(parseSort("created_at", null)).toEqual({ column: "created_at", dir: "desc" });
    expect(parseSort("title", null)).toEqual({ column: "title", dir: "asc" });
    expect(parseSort("title", "sideways")).toEqual({ column: "title", dir: "asc" });
    expect(parseSort("space_id", "asc")).toBeNull();
    expect(parseSort("id; drop table tickets", "asc")).toBeNull();
    expect(parseSort(null, "asc")).toBeNull();
  });

  it("formats London wall-clock as YYYY-MM-DD HH:MM:SS", () => {
    expect(formatLondonDateTime("2026-07-01T12:34:56Z")).toBe("2026-07-01 13:34:56");
    expect(formatLondonDateTime("2026-01-15T00:05:09Z")).toBe("2026-01-15 00:05:09");
    expect(formatLondonDateTime(null)).toBe("");
    expect(formatLondonDateTime("nope")).toBe("");
  });
});
