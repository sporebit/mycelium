import { describe, expect, it } from "vitest";
import { findRecurring, merchantKey, summarise, type Txn } from "./recurring";

let n = 0;
const t = (txn_date: string, description: string, pounds: number, txn_type = "Card Payment"): Txn => ({ id: `t${++n}`, txn_date, description, enriched_merchant: null, amount: -pounds, txn_type });
const monthly = (description: string, pounds: number | number[], from: [number, number], count: number, day = 3, type = "Card Payment") =>
  Array.from({ length: count }, (_, i) => {
    const m = from[1] - 1 + i;
    const date = `${from[0] + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return t(date, description, Array.isArray(pounds) ? pounds[i] : pounds, type);
  });

describe("a merchant's name from a statement line", () => {
  it("reads the same whatever reference, date or card marker follows it", () => {
    expect(merchantKey("NETFLIX.COM 866-579-7172 CD 4521")).toBe("NETFLIX");
    expect(merchantKey("CARD PAYMENT TO NETFLIX.COM,10.99 GBP ON 03-06-2026")).toBe("NETFLIX");
    expect(merchantKey("SPOTIFY P2F8A1C9D3 STOCKHOLM")).toBe(merchantKey("SPOTIFY P3E77B21AA STOCKHOLM"));
    expect(merchantKey("OCTOPUS ENERGY LTD 0012345678")).toBe("OCTOPUS ENERGY");
    expect(merchantKey("anything", "Amazon Prime")).toBe("AMAZON PRIME");
    expect(merchantKey(null)).toBe("");
  });
});

describe("finding what recurs", () => {
  it("finds a monthly subscription from three payments, with its next date", () => {
    const [r] = findRecurring(monthly("NETFLIX.COM 866-579", 10.99, [2026, 3], 4));
    expect(r).toMatchObject({ key: "NETFLIX", name: "Netflix", cadence: "monthly", kind: "subscription", amount_pence: 1099, monthly_pence: 1099, fixed: true, count: 4, first_on: "2026-03-03", last_on: "2026-06-03", next_on: "2026-07-03", active: true, rise: null });
    expect(r.txn_ids).toHaveLength(4);
    // a name reads as a name; initials stay initials
    expect(findRecurring(monthly("CLOUD BOX", 2, [2026, 3], 4))[0].name).toBe("Cloud Box");
    expect(findRecurring(monthly("EE DPD GYM", 2, [2026, 3], 4))[0].name).toBe("EE DPD Gym");
  });

  it("does not call two payments a subscription, unless they are a direct debit or a year apart", () => {
    expect(findRecurring(monthly("NEW GYM", 30, [2026, 5], 2))).toEqual([]);
    expect(findRecurring(monthly("COUNCIL TAX", 150, [2026, 5], 2, 1, "Direct Debit"))).toMatchObject([{ cadence: "monthly", kind: "bill" }]);
    expect(findRecurring([t("2025-04-10", "DOMAIN RENEWAL CO", 12.99), t("2026-04-11", "DOMAIN RENEWAL CO", 12.99)])).toMatchObject([{ cadence: "yearly", monthly_pence: 108, next_on: "2027-04-11" }]);
  });

  it("sees a price rise, and when it began", () => {
    const [r] = findRecurring(monthly("STREAMING PLUS", [7.99, 7.99, 7.99, 7.99, 9.99, 9.99], [2026, 1], 6));
    expect(r.rise).toEqual({ from_pence: 799, to_pence: 999, since: "2026-05-03" });
    expect(r.amount_pence).toBe(999);
    // a penny or two is not a rise
    expect(findRecurring(monthly("STEADY CO", [5, 5, 5, 5.02], [2026, 1], 4))[0].rise).toBeNull();
  });

  it("keeps a bill whose amount moves, and reports what it usually comes to", () => {
    const [r] = findRecurring(monthly("OCTOPUS ENERGY", [88.1, 121.4, 97.2, 64.9, 70.3], [2026, 2], 5, 14, "Direct Debit"));
    expect(r).toMatchObject({ kind: "bill", fixed: false, cadence: "monthly", rise: null });
    expect(r.monthly_pence).toBe(8810);
  });

  it("is not fooled by the weekly shop, a one-off, a transfer or a refund", () => {
    const shop = [12.4, 31.9, 8.7, 44.1, 19.3, 27.8].map((p, i) => t(`2026-05-${String(1 + i * 7).padStart(2, "0")}`, "TESCO STORES 3301", p));
    const transfers = monthly("TO SAVINGS", 500, [2026, 1], 6, 1, "Transfer");
    const refund = { ...t("2026-05-02", "NETFLIX.COM", 10.99), amount: 10.99 };
    expect(findRecurring([...shop, t("2026-05-09", "ONE OFF SHOP", 80), ...transfers, refund])).toEqual([]);
  });

  it("takes two charges on one day as one payment", () => {
    const rows = [...monthly("CLOUD STORAGE", 1.99, [2026, 1], 4), t("2026-02-03", "CLOUD STORAGE", 1.99)];
    expect(findRecurring(rows)).toMatchObject([{ count: 4, cadence: "monthly" }]);
  });

  it("judges whether it is still running by where the data ends, not by today", () => {
    const old = monthly("CANCELLED BOX", 12, [2025, 9], 4); // last paid December
    const live = monthly("STILL GOING", 6, [2026, 2], 5); // last paid June
    const found = findRecurring([...old, ...live]);
    expect(found.find((r) => r.key === "CANCELLED BOX")!.active).toBe(false);
    expect(found.find((r) => r.key === "STILL GOING")!.active).toBe(true);
    // months after the last import, with nothing new imported, nothing has "lapsed"
    expect(found.find((r) => r.key === "STILL GOING")!.next_on).toBe("2026-07-03");
    // told the data runs to October, it has
    expect(findRecurring(live, "2026-10-01")[0].active).toBe(false);
  });

  it("handles the end of a month and other rhythms", () => {
    expect(findRecurring(monthly("RENT", 900, [2026, 1], 3, 31, "Standing Order").map((r, i) => ({ ...r, txn_date: ["2026-01-31", "2026-02-28", "2026-03-31"][i] })))[0].next_on).toBe("2026-04-30");
    const weekly = Array.from({ length: 5 }, (_, i) => t(`2026-06-${String(1 + i * 7).padStart(2, "0")}`, "MILK ROUND", 6.5));
    expect(findRecurring(weekly)[0]).toMatchObject({ cadence: "weekly", monthly_pence: 2817, next_on: "2026-07-06" });
  });

  it("puts what is running, and costs most, first", () => {
    const found = findRecurring([...monthly("SMALL", 2, [2026, 2], 5), ...monthly("LARGE", 40, [2026, 2], 5), ...monthly("GONE", 99, [2025, 6], 4)]);
    expect(found.map((r) => r.key)).toEqual(["LARGE", "SMALL", "GONE"]);
  });
});

describe("the top of the page", () => {
  it("adds up what is running, leaves out what was marked not recurring, and counts what has not been looked at", () => {
    const found = findRecurring([...monthly("NETFLIX", 10.99, [2026, 2], 5), ...monthly("MAGAZINE", 4, [2026, 2], 5), ...monthly("COUNCIL TAX", 150, [2026, 2], 5, 1, "Direct Debit"), ...monthly("LUNCH PLACE", 7, [2026, 2], 5)]);
    const s = summarise(found, { NETFLIX: "keep", "LUNCH PLACE": "not_recurring" }, "2026-06-03");
    expect(s).toEqual({ as_of: "2026-06-03", monthly_pence: 1099 + 400 + 15000, yearly_pence: (1099 + 400 + 15000) * 12, bills: 1, subscriptions: 2, rises: 0, unlooked: 1 });
  });
});

describe("a price that steps up", () => {
  it("is still a fixed price, however big the step, and is reported as a rise", () => {
    const [r] = findRecurring(monthly("CLOUD BOX", [4.99, 4.99, 4.99, 6.99], [2026, 2], 4, 20));
    expect(r).toMatchObject({ key: "CLOUD BOX", fixed: true, amount_pence: 699, monthly_pence: 699, rise: { from_pence: 499, to_pence: 699, since: "2026-05-20" } });
  });

  it("a price that came down is not a rise", () => {
    expect(findRecurring(monthly("PHONE PLAN", [20, 20, 20, 12], [2026, 2], 4))[0]).toMatchObject({ fixed: true, amount_pence: 1200, rise: null });
  });

  it("a rise from long ago is no longer news", () => {
    expect(findRecurring(monthly("OLD RISE", [5, 5, 5, 8, 8, 8, 8, 8], [2025, 9], 8))[0]).toMatchObject({ fixed: true, rise: null });
  });
});
