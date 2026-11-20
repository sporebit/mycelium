import { describe, expect, it } from "vitest";
import { budgetAlerts, budgetMonth, daysIn } from "./budget";

describe("budget against actual", () => {
  it("knows how long a month is", () => {
    expect([daysIn("2026-02"), daysIn("2028-02"), daysIn("2026-11"), daysIn("2026-12")]).toEqual([28, 29, 30, 31]);
  });

  it("shows what is spent, what is left and where the month is heading", () => {
    const m = budgetMonth({ Groceries: 40000, Fuel: 12000, Entertainment: 5000 }, { Groceries: 22000, Fuel: 3000, Entertainment: 6100 }, "2026-11", 15);
    expect(m).toMatchObject({ month: "2026-11", day: 15, days: 30, budget_pence: 57000, spent_pence: 31100, unbudgeted_pence: 0 });
    const by = Object.fromEntries(m.lines.map((l) => [l.category, l]));
    expect(by.Groceries).toMatchObject({ left_pence: 18000, used: 0.55, projected_pence: 44000, state: "heading_over" });
    expect(by.Fuel).toMatchObject({ left_pence: 9000, projected_pence: 6000, state: "fine" });
    expect(by.Entertainment).toMatchObject({ left_pence: -1100, state: "over" });
    // what needs looking at comes first
    expect(m.lines.map((l) => l.category)).toEqual(["Entertainment", "Groceries", "Fuel"]);
  });

  it("lists spending with no budget set, and leaves out money that only moved", () => {
    const m = budgetMonth({ Groceries: 40000 }, { Groceries: 100, Shopping: 2500, Income: 300000, "Transfer (internal)": 50000 }, "2026-11", 30);
    expect(m.lines.map((l) => [l.category, l.state])).toEqual([
      ["Groceries", "fine"],
      ["Shopping", "none"],
    ]);
    expect(m.unbudgeted_pence).toBe(2500);
    expect(m.spent_pence).toBe(2600);
  });

  it("does not say a finished month is heading anywhere", () => {
    const m = budgetMonth({ Groceries: 40000 }, { Groceries: 39000 }, "2026-10", 31);
    expect(m.lines[0]).toMatchObject({ projected_pence: 39000, state: "fine" });
  });
});

describe("spending nudges", () => {
  const month = (spent: number, day = 18) => budgetMonth({ Groceries: 40000 }, { Groceries: spent }, "2026-11", day);

  it("says nothing under 80%", () => {
    expect(budgetAlerts(month(31000), new Set())).toEqual([]);
  });

  it("nudges once at 80% and once at 100%, with a percentage and never an amount", () => {
    const at80 = budgetAlerts(month(33000), new Set());
    expect(at80).toEqual([{ category: "Groceries", level: 80, title: "Groceries: 80% of this month's budget used, with 12 days to go" }]);
    expect(at80[0].title).not.toMatch(/£|\d{3}/);
    const sent = new Set([at80[0].title]);
    expect(budgetAlerts(month(35000, 20), sent), "the days to go changed; it is still the same nudge").toEqual([]);
    const at100 = budgetAlerts(month(40500, 26), sent);
    expect(at100).toEqual([{ category: "Groceries", level: 100, title: "Groceries: this month's budget is used up, with 4 days to go" }]);
    expect(budgetAlerts(month(47000, 29), new Set([...sent, at100[0].title]))).toEqual([]);
  });

  it("goes straight to the second one when a category jumps past both", () => {
    expect(budgetAlerts(month(45000), new Set()).map((a) => a.level)).toEqual([100]);
  });

  it("words the last days of a month", () => {
    expect(budgetAlerts(month(33000, 29), new Set())[0].title).toBe("Groceries: 80% of this month's budget used, with a day to go");
    expect(budgetAlerts(month(33000, 30), new Set())[0].title).toBe("Groceries: 80% of this month's budget used");
  });

  it("says nothing about a category with no budget", () => {
    expect(budgetAlerts(budgetMonth({}, { Shopping: 99999 }, "2026-11", 10), new Set())).toEqual([]);
  });
});
