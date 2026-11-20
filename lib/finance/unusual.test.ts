import { describe, expect, it } from "vitest";
import type { Txn } from "./recurring";
import { bannedIn } from "@/lib/daily/words";
import { FLOOR_PENCE, MIN_HISTORY, unusualPayments, unusualTitle } from "./unusual";

let n = 0;
const t = (date: string, description: string, pounds: number, type = "Card Payment"): Txn => ({ id: `t${++n}`, txn_date: date, description, enriched_merchant: null, amount: -pounds, txn_type: type });

/** Six months of ordinary spending: a weekly shop, a monthly phone bill, coffees. */
function ordinary(): Txn[] {
  const out: Txn[] = [];
  for (let w = 0; w < 26; w++) {
    const d = new Date(Date.UTC(2026, 0, 5 + w * 7)).toISOString().slice(0, 10);
    out.push(t(d, "BIG GROCER 1234", 60 + (w % 5) * 4));
    out.push(t(d, "COFFEE PLACE", 3.2));
  }
  for (let m = 1; m <= 6; m++) out.push(t(`2026-0${m}-15`, "PHONE CO", 25, "Direct Debit"));
  return out;
}

describe("unusualPayments", () => {
  it("says nothing with too little history: there is no usual yet", () => {
    const history = ordinary().slice(0, MIN_HISTORY - 1);
    expect(unusualPayments([t("2026-07-01", "NEW SOFA SHOP", 900)], history)).toEqual([]);
  });

  it("a first payment to a new merchant, in the top two per cent and over the floor, is unusual", () => {
    const hit = t("2026-07-01", "NEW SOFA SHOP", 900);
    expect(unusualPayments([hit, t("2026-07-01", "COFFEE PLACE", 3.4)], ordinary())).toEqual([hit]);
  });

  it("a known merchant is unusual at three times its usual, not before", () => {
    const history = ordinary();
    expect(unusualPayments([t("2026-07-01", "BIG GROCER 5678", 150)], history)).toEqual([]);
    const hit = t("2026-07-01", "BIG GROCER 5678", 240);
    expect(unusualPayments([hit], history)).toEqual([hit]);
  });

  it("under the floor nothing is unusual, however rare", () => {
    const small = ordinary().map((x) => ({ ...x, amount: x.amount / 10 }));
    expect(unusualPayments([t("2026-07-01", "ODD ONE", FLOOR_PENCE / 100 - 1)], small)).toEqual([]);
  });

  it("transfers and old payments in the same import are not news", () => {
    const history = ordinary();
    expect(unusualPayments([t("2026-07-01", "TO SAVINGS", 2000, "Transfer")], history)).toEqual([]);
    // the import reached 1 July; a large payment from March came with it but is not new
    expect(unusualPayments([t("2026-07-01", "COFFEE PLACE", 3), t("2026-03-02", "OLD SOFA SHOP", 900)], history)).toEqual([]);
  });

  it("the dearest first, and the line about them names no amount and says nothing banned", () => {
    const a = t("2026-07-01", "SHOP A", 400);
    const b = t("2026-07-02", "SHOP B", 700);
    expect(unusualPayments([a, b], ordinary()).map((x) => x.id)).toEqual([b.id, a.id]);
    for (const c of [1, 2]) {
      expect(unusualTitle(c)).not.toMatch(/£|\d\.\d\d/);
      expect(bannedIn(unusualTitle(c))).toBeNull();
    }
  });
});
