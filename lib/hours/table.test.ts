import { describe, expect, it } from "vitest";
import { applyTable, compareValues, matchFilter, nextSort, type ColumnDef } from "./table";

// Synthetic rows only.
type Row = { name: string; minutes: number | null; pct: number; logged: boolean; date: string | null };

const COLS: ColumnDef<Row>[] = [
  { key: "name", label: "Name", kind: "text", get: (r) => r.name },
  { key: "minutes", label: "Time", kind: "duration", get: (r) => r.minutes },
  { key: "pct", label: "%", kind: "pct", get: (r) => r.pct },
  { key: "logged", label: "Logged", kind: "bool", get: (r) => r.logged },
  { key: "date", label: "Date", kind: "date", get: (r) => r.date },
];
const col = (k: string) => COLS.find((c) => c.key === k)!;

const ROWS: Row[] = [
  { name: "alpha", minutes: 90, pct: 0.5, logged: true, date: "2026-11-17" },
  { name: "Bravo", minutes: null, pct: 0, logged: false, date: null },
  { name: "charlie", minutes: 30, pct: 1.25, logged: false, date: "2026-11-18" },
  { name: "delta", minutes: 60, pct: 0.75, logged: true, date: "2026-11-16" },
];

describe("nextSort", () => {
  it("numbers start largest first, text starts A→Z, third click clears", () => {
    expect(nextSort(null, col("minutes"))).toEqual({ key: "minutes", dir: "desc" });
    expect(nextSort({ key: "minutes", dir: "desc" }, col("minutes"))).toEqual({ key: "minutes", dir: "asc" });
    expect(nextSort({ key: "minutes", dir: "asc" }, col("minutes"))).toBeNull();
    expect(nextSort(null, col("name"))).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, col("minutes"))).toEqual({ key: "minutes", dir: "desc" });
  });
});

describe("compareValues", () => {
  it("puts empties last, ticks first, and sorts text case-insensitively", () => {
    expect(compareValues(null, 5)).toBeGreaterThan(0);
    expect(compareValues(5, null)).toBeLessThan(0);
    expect(compareValues(true, false)).toBeLessThan(0);
    expect(compareValues("alpha", "Bravo")).toBeLessThan(0);
    expect(compareValues("ABC-10", "ABC-9")).toBeGreaterThan(0);
  });
});

describe("matchFilter", () => {
  it("duration operators compare in minutes in any parseDuration form", () => {
    expect(matchFilter(col("minutes"), ROWS[0], ">1:00")).toBe(true);
    expect(matchFilter(col("minutes"), ROWS[3], ">1:00")).toBe(false);
    expect(matchFilter(col("minutes"), ROWS[3], ">=60")).toBe(true);
    expect(matchFilter(col("minutes"), ROWS[2], "<1h")).toBe(true);
    expect(matchFilter(col("minutes"), ROWS[2], "=0:30")).toBe(true);
    expect(matchFilter(col("minutes"), ROWS[2], "!=0:30")).toBe(false);
    expect(matchFilter(col("minutes"), ROWS[1], ">0")).toBe(false); // empty never matches a comparison
    expect(matchFilter(col("minutes"), ROWS[0], ">")).toBe(true); // operator alone: still typing
  });
  it("duration substring matches the shown h:mm", () => {
    expect(matchFilter(col("minutes"), ROWS[0], "1:3")).toBe(true);
    expect(matchFilter(col("minutes"), ROWS[3], "1:3")).toBe(false);
  });
  it("pct compares in percent", () => {
    expect(matchFilter(col("pct"), ROWS[2], ">100")).toBe(true);
    expect(matchFilter(col("pct"), ROWS[0], ">=50%")).toBe(true);
    expect(matchFilter(col("pct"), ROWS[3], "<75")).toBe(false);
  });
  it("bool words", () => {
    expect(matchFilter(col("logged"), ROWS[0], "yes")).toBe(true);
    expect(matchFilter(col("logged"), ROWS[0], "x")).toBe(true);
    expect(matchFilter(col("logged"), ROWS[1], "no")).toBe(true);
    expect(matchFilter(col("logged"), ROWS[0], "no")).toBe(false);
    expect(matchFilter(col("logged"), ROWS[0], "maybe")).toBe(true);
  });
  it("text is a case-insensitive substring; blank matches empties", () => {
    expect(matchFilter(col("name"), ROWS[1], "bra")).toBe(true);
    expect(matchFilter(col("name"), ROWS[0], "bra")).toBe(false);
    expect(matchFilter(col("date"), ROWS[1], "blank")).toBe(true);
    expect(matchFilter(col("date"), ROWS[0], "blank")).toBe(false);
    expect(matchFilter(col("date"), ROWS[0], "11-17")).toBe(true);
  });
});

describe("applyTable", () => {
  it("filters then sorts, empties last in both directions, stable on ties", () => {
    const desc = applyTable(ROWS, COLS, { key: "minutes", dir: "desc" }, {});
    expect(desc.map((r) => r.name)).toEqual(["alpha", "delta", "charlie", "Bravo"]);
    const asc = applyTable(ROWS, COLS, { key: "minutes", dir: "asc" }, {});
    expect(asc.map((r) => r.name)).toEqual(["charlie", "delta", "alpha", "Bravo"]);
    const filtered = applyTable(ROWS, COLS, { key: "name", dir: "asc" }, { logged: "yes", minutes: ">=1:00" });
    expect(filtered.map((r) => r.name)).toEqual(["alpha", "delta"]);
    expect(applyTable(ROWS, COLS, null, {})).toEqual(ROWS);
  });
});
