import { describe, expect, it } from "vitest";
import { daysIn, monthlyBillsDue, sameDayIn, type BillRow } from "./bills";

const row = (o: Partial<BillRow> & { id: string; paid_on: string }): BillRow => ({
  title: "Gas",
  amount_pence: 8000,
  paid_by: "tess",
  category: "bill",
  recurs: "none",
  recurs_from: null,
  ...o,
});

describe("household bills that add themselves", () => {
  it("knows how long each month is, and lands a bill on the same day or the last one there is", () => {
    expect(daysIn("2026-02")).toBe(28);
    expect(daysIn("2028-02")).toBe(29);
    expect(daysIn("2026-11")).toBe(30);
    expect(sameDayIn("2026-01-31", "2026-02")).toBe("2026-02-28");
    expect(sameDayIn("2026-01-15", "2026-02")).toBe("2026-02-15");
    expect(sameDayIn("2026-10-31", "2026-11")).toBe("2026-11-30");
  });

  it("adds this month's row for a monthly bill from last month, pointing back at it, once", () => {
    const gas = row({ id: "gas", paid_on: "2026-10-12", recurs: "monthly" });
    const due = monthlyBillsDue([gas], "2026-11-01");
    expect(due).toEqual([{ title: "Gas", amount_pence: 8000, paid_by: "tess", paid_on: "2026-11-12", category: "bill", recurs: "none", recurs_from: "gas", note: null }]);
    // the row it wrote is there now: nothing more this month
    const written = row({ id: "nov", paid_on: "2026-11-12", recurs_from: "gas" });
    expect(monthlyBillsDue([gas, written], "2026-11-20")).toEqual([]);
    // and a row the tick wrote is never a source of its own
    expect(monthlyBillsDue([written], "2026-12-01")).toEqual([]);
  });

  it("carries a price rise typed on the latest month forward, but keeps the first bill's day", () => {
    const gas = row({ id: "gas", paid_on: "2026-09-30", recurs: "monthly" });
    const oct = row({ id: "oct", paid_on: "2026-10-30", recurs_from: "gas", amount_pence: 8500, paid_by: "phil" });
    const nov = row({ id: "nov", paid_on: "2026-11-02", recurs_from: "gas", amount_pence: 9000 }); // moved by hand this month
    const [due] = monthlyBillsDue([gas, oct, nov], "2026-12-01");
    expect(due).toMatchObject({ amount_pence: 9000, paid_by: "tess", paid_on: "2026-12-30", recurs_from: "gas" });
  });

  it("adds nothing for a bill from this month or a later one, for one marked once or yearly, or for an empty list", () => {
    expect(monthlyBillsDue([row({ id: "a", paid_on: "2026-11-03", recurs: "monthly" })], "2026-11-20")).toEqual([]);
    expect(monthlyBillsDue([row({ id: "b", paid_on: "2026-12-03", recurs: "monthly" })], "2026-11-20")).toEqual([]);
    expect(monthlyBillsDue([row({ id: "c", paid_on: "2026-10-03" })], "2026-11-20")).toEqual([]);
    expect(monthlyBillsDue([row({ id: "d", paid_on: "2026-10-03", recurs: "yearly" })], "2026-11-20")).toEqual([]);
    expect(monthlyBillsDue([], "2026-11-20")).toEqual([]);
  });

  it("does not fill in months that passed with nothing written: a bill from the spring adds this month only", () => {
    const due = monthlyBillsDue([row({ id: "old", paid_on: "2026-03-05", recurs: "monthly" })], "2026-11-20");
    expect(due.map((d) => d.paid_on)).toEqual(["2026-11-05"]);
  });

  it("the same answer whoever asks and however often: pure, and two bills are two rows", () => {
    const rows = [row({ id: "gas", paid_on: "2026-10-12", recurs: "monthly" }), row({ id: "water", title: "Water", paid_on: "2026-10-01", recurs: "monthly", amount_pence: 3000 })];
    const once = monthlyBillsDue(rows, "2026-11-20");
    expect(once.map((d) => d.title).sort()).toEqual(["Gas", "Water"]);
    expect(monthlyBillsDue(rows, "2026-11-20")).toEqual(once);
  });
});
