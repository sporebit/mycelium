/**
 * Bills, subscriptions and the budget (master run §10; 0173), end to end as
 * Phil, with transactions seeded by SQL (nothing is imported from a bank in
 * a test). The merchants are made-up names with no digits in them: a token
 * with a digit in it is treated as a reference number and dropped.
 *
 * Two things matter beyond the arithmetic: nobody else sees any of it, and
 * nothing is in the page until amounts are shown.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_CRON_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, personalSpace, TESS } from "./support/users.ts";

const RUN = `e2e-bills-${Date.now().toString(36)}`;
type Item = { key: string; name: string; cadence: string; kind: string; amount_pence: number; monthly_pence: number; fixed: boolean; count: number; active: boolean; next_on: string; mark: string | null; rise: { from_pence: number; to_pence: number; since: string } | null };
type View = { summary: { as_of: string | null; monthly_pence: number; subscriptions: number; bills: number; rises: number; unlooked: number }; items: Item[] };
type Budget = { month: string; day: number; days: number; no_data: boolean; spent_pence: number; budget_pence: number; lines: Array<{ category: string; budget_pence: number; spent_pence: number; used: number | null; state: string }> };

let phil: APIRequestContext;
let account = "";
let n = 0;

const txn = (date: string, description: string, pounds: number, type = "Card Payment", category: string | null = null) =>
  localSql(
    `insert into public.transactions (account_id, txn_date, txn_type, description, amount, debit, dedup_hash, category, space_id, created_by) values ('${account}', '${date}', '${type}', '${description}', ${-pounds}, ${pounds}, '${RUN}-${++n}', ${category ? `'${category}'` : "null"}, '${personalSpace(PHIL)}', '${PHIL.id}')`,
  );
const recurring = async (who: APIRequestContext) => (await (await who.get("/api/finance/recurring")).json()) as View;
const item = (v: View, key: string) => v.items.find((i) => i.key === key);
const mark = (key: string, value: string | null) => phil.post("/api/finance/recurring", { data: { key, mark: value } });
const budget = async (month: string) => (await (await phil.get(`/api/finance/budget?month=${month}`)).json()) as Budget;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  phil = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  account = localSql(`insert into public.bank_accounts (bank, external_key, label, space_id, created_by) values ('e2e', '${RUN}', 'E2E current', '${personalSpace(PHIL)}', '${PHIL.id}') returning id`)[0][0];
  for (const m of ["01", "02", "03", "04", "05"]) txn(`2026-${m}-03`, "ZZTESTSTREAM PLAY 99123", 9.99);
  [80.1, 95.4, 70.25].forEach((p, i) => txn(`2026-0${3 + i}-14`, "ZZTESTPOWER ENERGY LTD 0012345678", p, "Direct Debit", "Bills & Utilities"));
  [4.99, 4.99, 4.99, 6.99].forEach((p, i) => txn(`2026-0${2 + i}-20`, "ZZTESTCLOUD BOX", p));
  txn("2026-05-04", "ZZTESTGROCER ONE", 120, "Card Payment", "Groceries");
  txn("2026-05-09", "ZZTESTGROCER TWO", 95.5, "Card Payment", "Groceries");
  txn("2026-05-25", "ZZTESTGROCER THREE", 60, "Card Payment", "Groceries");
  txn("2026-05-12", "ZZTEST TO SAVINGS", 500, "Transfer", "Transfer (internal)");
});

test.afterAll(async () => {
  localSql(`delete from public.transactions where dedup_hash like '${RUN}-%'`);
  localSql(`delete from public.bank_accounts where id = '${account}'`);
  localSql(`delete from public.finance_recurring_marks where merchant_key like 'ZZTEST%'`);
  localSql(`delete from public.finance_budgets where space_id = '${personalSpace(PHIL)}' and category in ('Groceries', 'Fuel')`);
  await phil.dispose();
});

test("recurring payments are found from the transactions: how often, how much, when next, and a price rise", async () => {
  const v = await recurring(phil);
  expect(v.summary.as_of).toBe("2026-05-25");
  expect(item(v, "ZZTESTSTREAM PLAY")).toMatchObject({ name: "Zzteststream Play", cadence: "monthly", kind: "subscription", amount_pence: 999, monthly_pence: 999, fixed: true, count: 5, active: true, next_on: "2026-06-03", mark: null, rise: null });
  expect(item(v, "ZZTESTPOWER ENERGY")).toMatchObject({ cadence: "monthly", kind: "bill", fixed: false, count: 3, active: true });
  expect(item(v, "ZZTESTCLOUD BOX")).toMatchObject({ amount_pence: 699, rise: { from_pence: 499, to_pence: 699, since: "2026-05-20" } });
  // the shop on three odd days and the transfer to savings are neither
  expect(v.items.filter((i) => i.key.startsWith("ZZTESTGROCER") || i.key.includes("SAVINGS"))).toEqual([]);
  expect(v.summary.rises).toBeGreaterThanOrEqual(1);
});

test("keep, cancel and not-a-bill are remembered, and not-a-bill leaves the totals", async () => {
  const before = await recurring(phil);
  expect((await mark("ZZTESTSTREAM PLAY", "keep")).status()).toBe(200);
  expect((await mark("ZZTESTCLOUD BOX", "not_recurring")).status()).toBe(200);
  expect((await mark("ZZTESTCLOUD BOX", "burn")).status()).toBe(400);
  expect((await mark("x", "keep")).status()).toBe(400);
  let v = await recurring(phil);
  expect(item(v, "ZZTESTSTREAM PLAY")!.mark).toBe("keep");
  expect(item(v, "ZZTESTCLOUD BOX")!.mark).toBe("not_recurring");
  expect(v.summary.monthly_pence).toBe(before.summary.monthly_pence - 699);
  expect(v.summary.unlooked).toBe(before.summary.unlooked - 2);
  // taken back
  expect((await mark("ZZTESTCLOUD BOX", null)).status()).toBe(200);
  v = await recurring(phil);
  expect(item(v, "ZZTESTCLOUD BOX")!.mark).toBeNull();
  expect(v.summary.monthly_pence).toBe(before.summary.monthly_pence);
});

test("nobody else sees any of it", async ({ playwright }) => {
  const tess = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: "e2e/.auth/tess.json" });
  const v = await recurring(tess);
  expect(v.items.filter((i) => i.key.startsWith("ZZTEST"))).toEqual([]);
  const b = (await (await tess.get("/api/finance/budget?month=2026-05")).json()) as Budget;
  expect(b.spent_pence).toBe(0);
  // her saying "keep" is about her own payments, not his
  await tess.post("/api/finance/recurring", { data: { key: "ZZTESTPOWER ENERGY", mark: "cancel" } });
  expect(item(await recurring(phil), "ZZTESTPOWER ENERGY")!.mark).toBeNull();
  localSql(`delete from public.finance_recurring_marks where merchant_key = 'ZZTESTPOWER ENERGY' and space_id = '${personalSpace(TESS)}'`);
  await tess.dispose();
});

test("a budget is set per category and compared with what was spent, up to the day the data runs to", async () => {
  let b = await budget("2026-05");
  expect(b).toMatchObject({ month: "2026-05", day: 25, days: 31, no_data: false });
  expect(b.lines.find((l) => l.category === "Groceries")).toMatchObject({ spent_pence: 27550, budget_pence: 0, used: null, state: "none" });
  expect(b.lines.find((l) => l.category === "Transfer (internal)"), "money that only moved is not spending").toBeUndefined();

  expect((await phil.put("/api/finance/budget", { data: { category: "Groceries", monthly_pence: 30000 } })).status()).toBe(200);
  expect((await phil.put("/api/finance/budget", { data: { category: "Income", monthly_pence: 100 } })).status()).toBe(400);
  expect((await phil.put("/api/finance/budget", { data: { category: "Sweets", monthly_pence: 100 } })).status()).toBe(400);
  expect((await phil.put("/api/finance/budget", { data: { category: "Fuel", monthly_pence: -5 } })).status()).toBe(400);
  b = await budget("2026-05");
  const groceries = b.lines.find((l) => l.category === "Groceries")!;
  expect(groceries).toMatchObject({ budget_pence: 30000, spent_pence: 27550, state: "heading_over" });
  expect(groceries.used).toBeCloseTo(0.918, 2);

  // a month the imports have not reached: nothing to compare, and the page says so
  expect(await budget("2026-09")).toMatchObject({ no_data: true, spent_pence: 0 });
  // an earlier month is whole
  expect(await budget("2026-04")).toMatchObject({ day: 30, days: 30, no_data: false });
});

test("the morning nudge job runs for everyone and sends nothing about a month with no data", async ({ request }) => {
  expect((await request.post("/api/cron/finance")).status()).toBe(401);
  const res = await request.post("/api/cron/finance", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()) as { failed: number; nudges: number }).toMatchObject({ failed: 0, nudges: 0 });
});

test("the pages: nothing is in the page until amounts are shown; then the sheet edits in place", async ({ page }) => {
  await page.goto("/finance/bills");
  const bills = page.getByTestId("finance-bills");
  await expect(bills.getByRole("heading", { name: "Bills and subscriptions" })).toBeVisible();
  await expect(bills.getByTestId("recurring-row").first()).toBeVisible();
  await expect(bills.getByTestId("bills-as-of")).toContainText("25 May 2026");
  // hidden by default: neither a merchant nor an amount is anywhere in the page
  let html = await page.content();
  expect(html).not.toContain("Zzteststream");
  expect(html).not.toContain("9.99");
  expect(html).not.toContain("95.40");

  await page.getByRole("button", { name: "Show financial values" }).click();
  await expect(bills.getByTestId("recurring-row").filter({ hasText: "Zzteststream Play" })).toContainText("£9.99");
  await expect(bills.getByTestId("recurring-row").filter({ hasText: "Zztestcloud Box" })).toContainText("price up");
  // say "cancel it" on the page
  const cloud = bills.getByTestId("recurring-row").filter({ hasText: "Zztestcloud Box" });
  await cloud.getByRole("button", { name: "Cancel it" }).click();
  await expect(bills.getByRole("region", { name: "To cancel" })).toContainText("Zztestcloud Box");

  await page.goto("/finance/budget");
  const budgetPage = page.getByTestId("finance-budget");
  await expect(budgetPage.getByRole("heading", { name: /Budget,/ })).toBeVisible();
  await budgetPage.getByRole("button", { name: "The month before" }).click({ clickCount: 1 });
  // step back to May 2026, where the seeded spending is
  for (let i = 0; i < 24 && !(await budgetPage.getByRole("heading", { name: "Budget, May 2026" }).isVisible()); i++) await budgetPage.getByRole("button", { name: "The month before" }).click();
  await expect(budgetPage.getByRole("heading", { name: "Budget, May 2026" })).toBeVisible();
  await expect(budgetPage.getByTestId("budget-as-of")).toContainText("Day 25 of 31");
  html = await page.content();
  expect(html, "hidden again after the page change").not.toContain("275.50");
  await expect(budgetPage.getByLabel("Monthly budget for Groceries")).toHaveCount(0);

  await page.getByRole("button", { name: "Show financial values" }).click();
  const cell = budgetPage.getByLabel("Monthly budget for Groceries");
  await expect(cell).toHaveValue("300");
  await expect(budgetPage.getByTestId("budget-row").filter({ hasText: "Groceries" })).toContainText("Heading over");
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/finance/budget") && r.request().method() === "PUT");
  await cell.fill("350");
  await cell.press("Enter");
  expect((await saved).status()).toBe(200);
  await expect(budgetPage.getByTestId("budget-row").filter({ hasText: "Groceries" })).not.toContainText("Heading over");
  expect((await budget("2026-05")).lines.find((l) => l.category === "Groceries")!.budget_pence).toBe(35000);
});
