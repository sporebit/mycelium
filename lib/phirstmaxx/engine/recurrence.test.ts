import { describe, expect, it } from "vitest";
import { expandForDisplay } from "./expand";
import { expandRecurrence } from "./recurrence";
import { londonTime } from "./time";

const range = (a: string, b: string) => ({ start: Date.parse(a), end: Date.parse(b) });
const isos = (occ: { start: number }[]) => occ.map((o) => new Date(o.start).toISOString());

describe("expandRecurrence", () => {
  it("returns a one-off block only when it overlaps the range", () => {
    const block = { start: Date.parse("2026-08-21T17:00:00Z"), end: Date.parse("2026-08-21T22:00:00Z"), rule: null };
    expect(expandRecurrence(block, range("2026-08-21T00:00Z", "2026-08-22T00:00Z"))).toHaveLength(1);
    expect(expandRecurrence(block, range("2026-08-22T00:00Z", "2026-08-23T00:00Z"))).toHaveLength(0);
  });

  it("keeps a weekly shift at 17:00 London across the March changeover", () => {
    // Monday 23 March 2026 (GMT) 17:00 = 17:00Z. BST starts 29 March.
    const block = { start: londonTime("2026-03-23", "17:00"), end: londonTime("2026-03-23", "23:00"), rule: "FREQ=WEEKLY" };
    const occ = expandRecurrence(block, range("2026-03-23T00:00Z", "2026-04-07T00:00Z"));
    expect(isos(occ)).toEqual([
      "2026-03-23T17:00:00.000Z",
      "2026-03-30T16:00:00.000Z", // still 17:00 London, now BST
      "2026-04-06T16:00:00.000Z",
    ]);
    expect(new Date(occ[1].end).toISOString()).toBe("2026-03-30T22:00:00.000Z");
  });

  it("keeps it at 17:00 London across the October changeover", () => {
    const block = { start: londonTime("2026-10-19", "17:00"), end: londonTime("2026-10-19", "23:00"), rule: "FREQ=WEEKLY" };
    const occ = expandRecurrence(block, range("2026-10-19T00:00Z", "2026-11-03T00:00Z"));
    expect(isos(occ)).toEqual([
      "2026-10-19T16:00:00.000Z",
      "2026-10-26T17:00:00.000Z", // GMT again
      "2026-11-02T17:00:00.000Z",
    ]);
  });

  it("skips exception dates", () => {
    const block = {
      start: londonTime("2026-08-03", "09:00"),
      end: londonTime("2026-08-03", "12:00"),
      rule: "FREQ=WEEKLY",
      exceptions: ["2026-08-10"],
    };
    const occ = expandRecurrence(block, range("2026-08-03T00:00Z", "2026-08-18T00:00Z"));
    expect(isos(occ)).toEqual(["2026-08-03T08:00:00.000Z", "2026-08-17T08:00:00.000Z"]);
  });

  it("handles BYDAY rules with several days", () => {
    const block = {
      start: londonTime("2026-08-03", "11:00"), // a Monday
      end: londonTime("2026-08-03", "15:00"),
      rule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    };
    const occ = expandRecurrence(block, range("2026-08-03T00:00Z", "2026-08-10T00:00Z"));
    expect(isos(occ)).toEqual(["2026-08-03T10:00:00.000Z", "2026-08-05T10:00:00.000Z", "2026-08-07T10:00:00.000Z"]);
  });

  it("does not produce occurrences before the anchor", () => {
    const block = { start: londonTime("2026-08-10", "09:00"), end: londonTime("2026-08-10", "10:00"), rule: "FREQ=WEEKLY" };
    expect(expandRecurrence(block, range("2026-08-01T00:00Z", "2026-08-12T00:00Z"))).toHaveLength(1);
  });

  it("degrades a malformed rule to a one-off block", () => {
    const block = { start: Date.parse("2026-08-21T17:00:00Z"), end: Date.parse("2026-08-21T22:00:00Z"), rule: "NOT A RULE" };
    expect(expandRecurrence(block, range("2026-08-21T00:00Z", "2026-08-22T00:00Z"))).toHaveLength(1);
  });
});

// New with the port: the hand-rolled subset replaces the rrule package, so
// the parts it claims to support are pinned here.
describe("expandRecurrence — the hand-rolled RRULE subset", () => {
  const monday = { start: londonTime("2026-08-03", "09:00"), end: londonTime("2026-08-03", "10:00") };

  it("honours INTERVAL and COUNT", () => {
    const occ = expandRecurrence({ ...monday, rule: "FREQ=WEEKLY;INTERVAL=2;COUNT=3" }, range("2026-08-01T00:00Z", "2026-10-01T00:00Z"));
    expect(isos(occ)).toEqual(["2026-08-03T08:00:00.000Z", "2026-08-17T08:00:00.000Z", "2026-08-31T08:00:00.000Z"]);
  });

  it("honours UNTIL as an inclusive date", () => {
    const occ = expandRecurrence({ ...monday, rule: "RRULE:FREQ=DAILY;UNTIL=20260805" }, range("2026-08-01T00:00Z", "2026-09-01T00:00Z"));
    expect(occ).toHaveLength(3);
  });

  it("expands a monthly 'second Saturday'", () => {
    const sat = { start: londonTime("2026-08-08", "10:00"), end: londonTime("2026-08-08", "12:00") };
    const occ = expandRecurrence({ ...sat, rule: "FREQ=MONTHLY;BYDAY=2SA" }, range("2026-08-01T00:00Z", "2026-11-01T00:00Z"));
    expect(isos(occ)).toEqual(["2026-08-08T09:00:00.000Z", "2026-09-12T09:00:00.000Z", "2026-10-10T09:00:00.000Z"]);
  });

  it("finds a weekly hit for an anchor years back without walking from it", () => {
    const old = { start: londonTime("2020-01-06", "17:00"), end: londonTime("2020-01-06", "18:00"), rule: "FREQ=WEEKLY" };
    expect(isos(expandRecurrence(old, range("2026-11-23T00:00Z", "2026-11-24T00:00Z")))).toEqual(["2026-11-23T17:00:00.000Z"]);
  });

  it("refuses parts it does not understand, as a one-off", () => {
    const occ = expandRecurrence({ ...monday, rule: "FREQ=WEEKLY;BYSETPOS=1" }, range("2026-08-01T00:00Z", "2026-09-01T00:00Z"));
    expect(occ).toHaveLength(1);
  });
});

describe("expandForDisplay", () => {
  it("tags each hit with its London day and skips rejected blocks", () => {
    const out = expandForDisplay(
      [
        { id: "a", start: londonTime("2026-08-03", "23:30"), end: londonTime("2026-08-04", "01:00"), rule: "FREQ=DAILY" },
        { id: "b", start: londonTime("2026-08-04", "09:00"), end: londonTime("2026-08-04", "10:00"), rejected: true },
      ],
      { start: londonTime("2026-08-04", "00:00"), end: londonTime("2026-08-05", "00:00") },
    );
    expect(out.map((d) => d.key)).toEqual(["a:2026-08-03", "a:2026-08-04"]);
    expect(out.every((d) => d.recurring)).toBe(true);
  });
});
