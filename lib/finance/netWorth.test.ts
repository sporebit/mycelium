import { describe, expect, it } from "vitest";
import { ageWords, freshness, holdingsAsOf, monthly, netWorthSeries, storedPence, type HoldingValue } from "./netWorth";

const v = (holding_id: string, kind: HoldingValue["kind"], as_of: string, pounds: number): HoldingValue => ({ holding_id, kind, as_of, value_pence: Math.round(pounds * 100) });

describe("storedPence", () => {
  it("keeps an amount owed as a negative, whichever sign was typed", () => {
    expect(storedPence("mortgage", 180_000_00)).toBe(-180_000_00);
    expect(storedPence("mortgage", -180_000_00)).toBe(-180_000_00);
    expect(storedPence("property", 300_000_00)).toBe(300_000_00);
    expect(storedPence("pension", -5)).toBe(5);
  });
});

describe("holdingsAsOf", () => {
  it("takes each holding's latest figure on or before the day, and leaves out one with no figure yet", () => {
    const values = [v("p", "pension", "2026-01-01", 40_000), v("p", "pension", "2026-06-01", 45_000), v("h", "property", "2026-09-01", 300_000)];
    expect(holdingsAsOf(values, "2026-05-31").get("p")?.value_pence).toBe(40_000_00);
    expect(holdingsAsOf(values, "2026-06-01").get("p")?.value_pence).toBe(45_000_00);
    expect(holdingsAsOf(values, "2026-06-01").has("h")).toBe(false);
    expect(holdingsAsOf(values, "2026-12-01").size).toBe(2);
  });
});

describe("netWorthSeries", () => {
  const snaps = [
    { date: "2026-03-01", net_worth_pence: 20_000_00 },
    { date: "2026-10-01", net_worth_pence: 25_000_00 },
  ];
  const values = [v("p", "pension", "2026-06-01", 45_000), v("m", "mortgage", "2026-06-01", -180_000), v("h", "property", "2026-06-01", 300_000), v("p", "pension", "2026-11-01", 47_000)];

  it("has a point on every day something changed, carries both sides forward, and sums them", () => {
    const s = netWorthSeries(snaps, values);
    expect(s.map((p) => p.date)).toEqual(["2026-03-01", "2026-06-01", "2026-10-01", "2026-11-01"]);
    expect(s[0]).toMatchObject({ sheet_pence: 20_000_00, holdings_pence: 0, total_pence: 20_000_00 });
    expect(s[1]).toMatchObject({ sheet_pence: 20_000_00, holdings_pence: 165_000_00, total_pence: 185_000_00 });
    expect(s[1].by_kind).toEqual({ pension: 45_000_00, mortgage: -180_000_00, property: 300_000_00 });
    expect(s[2]).toMatchObject({ sheet_pence: 25_000_00, holdings_pence: 165_000_00, total_pence: 190_000_00 });
    expect(s[3]).toMatchObject({ sheet_pence: 25_000_00, holdings_pence: 167_000_00, total_pence: 192_000_00 });
  });

  it("works with holdings alone (no sheet yet) and with the sheet alone", () => {
    const alone = netWorthSeries([], values);
    expect(alone[0]).toMatchObject({ date: "2026-06-01", sheet_pence: null, total_pence: 165_000_00 });
    expect(netWorthSeries(snaps, [])).toHaveLength(2);
    expect(netWorthSeries([], [])).toEqual([]);
  });

  it("monthly keeps the last point of each month", () => {
    const s = netWorthSeries([{ date: "2026-06-03", net_worth_pence: 1 }, { date: "2026-06-20", net_worth_pence: 2 }, { date: "2026-07-01", net_worth_pence: 3 }], []);
    expect(monthly(s).map((p) => [p.date, p.total_pence])).toEqual([["2026-06-20", 2], ["2026-07-01", 3]]);
  });
});

describe("how old a figure is", () => {
  it("in words and in bands", () => {
    expect(ageWords("2026-11-20", "2026-11-20")).toBe("today");
    expect(ageWords("2026-11-10", "2026-11-20")).toBe("10 days ago");
    expect(ageWords("2026-10-20", "2026-11-20")).toBe("4 weeks ago");
    expect(ageWords("2026-06-20", "2026-11-20")).toBe("5 months ago");
    expect(ageWords("2024-06-20", "2026-11-20")).toBe("over 2 years ago");
    expect(freshness("2026-11-01", "2026-11-20")).toBe("fresh");
    expect(freshness("2026-09-01", "2026-11-20")).toBe("ageing");
    expect(freshness("2026-06-01", "2026-11-20")).toBe("old");
  });
});
