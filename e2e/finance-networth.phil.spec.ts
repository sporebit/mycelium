/**
 * Net worth over time with by-hand holdings (master run §10; 0175), end to
 * end as Phil and Tess. The sheet is not reachable from a test server, so
 * one snapshot row is seeded by SQL; everything else goes through the API.
 *
 * Two things matter beyond the arithmetic: nobody else sees any of it, and
 * nothing is in the page until amounts are shown.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, personalSpace, TESS } from "./support/users.ts";

const RUN = `e2e-nw-${Date.now().toString(36)}`;
type Holding = { id: string; kind: string; name: string; value_pence: number | null; as_of: string | null; age: string | null; freshness: string | null; figures: number };
type Point = { date: string; sheet_pence: number | null; holdings_pence: number; total_pence: number; by_kind: Record<string, number> };
type View = { holdings: Holding[]; series: Point[]; now: Point | null; sheet_as_of: string | null; investments_pence: number };

let phil: APIRequestContext;
let tess: APIRequestContext;
const ids: string[] = [];

const view = async (who: APIRequestContext) => (await (await who.get("/api/finance/networth")).json()) as View;
const add = async (body: Record<string, unknown>) => {
  const res = await phil.post("/api/finance/holdings", { data: body });
  expect(res.status(), await res.text()).toBe(200);
  const id = ((await res.json()) as { id: string }).id;
  ids.push(id);
  return id;
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  phil = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  tess = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: "e2e/.auth/tess.json" });
  // one day from the sheet, long ago, so the line has a sheet side
  localSql(
    `insert into public.finance_snapshots (snapshot_date, snapshot, source, space_id, created_by) values ('2024-01-15', '{"net_worth": 20000, "currency": "GBP", "as_of": "2024-01-15", "categories": [], "notes": "${RUN}"}', 'manual', '${personalSpace(PHIL)}', '${PHIL.id}') on conflict (space_id, snapshot_date) do update set snapshot = excluded.snapshot`,
  );
});

test.afterAll(async () => {
  for (const id of ids) await phil.delete(`/api/finance/holdings/${id}`);
  localSql(`delete from public.finance_holdings where name like '${RUN}%'`);
  localSql(`delete from public.finance_snapshots where snapshot_date = '2024-01-15' and snapshot ->> 'notes' = '${RUN}'`);
  localSql(`delete from public.tickets where meta @> '{"finance_holding": "pension"}' and space_id in ('${personalSpace(PHIL)}', '${personalSpace(TESS)}')`);
  await phil.dispose();
  await tess.dispose();
});

test("holdings are added with a figure and a day; a mortgage is owed; the line sums the sheet and the holdings on each day they changed", async () => {
  const before = await view(phil);
  const baseline = before.series.filter((p) => p.date !== "2024-01-15" && p.date < "2024-02-01").length;
  expect(baseline).toBe(0);

  const pension = await add({ kind: "pension", name: `${RUN} Royal London`, value_pounds: 45000, as_of: "2024-03-01" });
  await add({ kind: "property", name: `${RUN} The house`, value_pounds: 300000, as_of: "2024-03-01" });
  const mortgage = await add({ kind: "mortgage", name: `${RUN} Mortgage`, value_pounds: 180000, as_of: "2024-03-01" });
  await add({ kind: "vehicle", name: `${RUN} Car`, value_pence: 800000, as_of: "2024-04-10" });
  expect((await phil.post("/api/finance/holdings", { data: { kind: "boat", name: "x" } })).status()).toBe(400);
  expect((await phil.post("/api/finance/holdings", { data: { kind: "other", name: "", value_pounds: 1 } })).status()).toBe(400);
  expect((await phil.post("/api/finance/holdings", { data: { kind: "other", name: "x", value_pounds: 1, as_of: "2024-02-30" } })).status()).toBe(400);

  const v = await view(phil);
  const mine = v.holdings.filter((h) => h.name.startsWith(RUN));
  expect(mine).toHaveLength(4);
  expect(mine.find((h) => h.id === mortgage)).toMatchObject({ value_pence: -18000000, as_of: "2024-03-01", figures: 1, freshness: "old" });
  expect(mine.find((h) => h.id === pension)!.age).toMatch(/years ago/);

  const p = (date: string) => v.series.find((x) => x.date === date)!;
  expect(p("2024-01-15")).toMatchObject({ sheet_pence: 2000000, holdings_pence: 0, total_pence: 2000000 });
  expect(p("2024-03-01")).toMatchObject({ sheet_pence: 2000000, holdings_pence: 16500000, total_pence: 18500000 });
  expect(p("2024-03-01").by_kind).toMatchObject({ pension: 4500000, property: 30000000, mortgage: -18000000 });
  expect(p("2024-04-10")).toMatchObject({ holdings_pence: 17300000, total_pence: 19300000 });
});

test("a new figure keeps the old one: the line steps, the holding counts two figures, and a same-day figure replaces", async () => {
  const pension = (await view(phil)).holdings.find((h) => h.name === `${RUN} Royal London`)!;
  expect((await phil.patch(`/api/finance/holdings/${pension.id}`, { data: { value_pounds: 47000, as_of: "2024-06-01" } })).status()).toBe(200);
  expect((await phil.patch(`/api/finance/holdings/${pension.id}`, { data: { value_pounds: 47500, as_of: "2024-06-01" } })).status()).toBe(200);
  expect((await phil.patch(`/api/finance/holdings/${pension.id}`, { data: {} })).status()).toBe(400);
  expect((await phil.patch(`/api/finance/holdings/${pension.id}`, { data: { value_pounds: "lots" } })).status()).toBe(400);
  const v = await view(phil);
  expect(v.holdings.find((h) => h.id === pension.id)).toMatchObject({ value_pence: 4750000, as_of: "2024-06-01", figures: 2 });
  expect(v.series.find((x) => x.date === "2024-06-01")).toMatchObject({ holdings_pence: 17550000 });
  expect(v.series.find((x) => x.date === "2024-04-10")!.by_kind.pension, "the earlier day still shows the earlier figure").toBe(4500000);
  // a rename leaves the figures alone
  expect((await phil.patch(`/api/finance/holdings/${pension.id}`, { data: { name: `${RUN} Royal London pension` } })).status()).toBe(200);
  expect((await view(phil)).holdings.find((h) => h.id === pension.id)).toMatchObject({ name: `${RUN} Royal London pension`, figures: 2 });
});

test("the pension item: one recurring ticket in his own space, made once, pointing at the page", async () => {
  await add({ kind: "pension", name: `${RUN} Second pension`, value_pounds: 1000 });
  const rows = localSql(`select title, recurrence_mode, recurrence_rrule, coalesce(scheduled_on::text, '-'), owner::text from public.tickets where meta @> '{"finance_holding": "pension"}' and space_id = '${personalSpace(PHIL)}' and deleted_at is null`);
  expect(rows).toHaveLength(1);
  expect(rows[0].slice(0, 3)).toEqual(["Update the pension figure", "spawn", "FREQ=MONTHLY;BYMONTHDAY=1"]);
  expect(rows[0][3]).toMatch(/-01$/);
  expect(rows[0][4]).toBe(PHIL.id);
  // the description has line breaks; localSql reads one line per row
  expect(localSql(`select replace(description, E'\\n', ' ') from public.tickets where meta @> '{"finance_holding": "pension"}' and space_id = '${personalSpace(PHIL)}'`)[0][0]).toContain("/finance/snapshot");
});

test("nobody else sees any of it, and hers are hers", async () => {
  const hers = await view(tess);
  expect(hers.holdings.filter((h) => h.name.startsWith(RUN))).toEqual([]);
  expect(hers.series.find((p) => p.date === "2024-03-01")).toBeUndefined();
  const res = await tess.post("/api/finance/holdings", { data: { kind: "vehicle", name: `${RUN} Tess bike`, value_pounds: 500 } });
  expect(res.status()).toBe(200);
  const hersId = ((await res.json()) as { id: string }).id;
  expect((await view(tess)).holdings.map((h) => h.name)).toContain(`${RUN} Tess bike`);
  expect((await view(phil)).holdings.map((h) => h.name)).not.toContain(`${RUN} Tess bike`);
  // she cannot change or remove his
  const his = (await view(phil)).holdings.find((h) => h.name.startsWith(RUN))!;
  expect((await tess.patch(`/api/finance/holdings/${his.id}`, { data: { value_pounds: 1 } })).status()).toBe(404);
  expect((await tess.delete(`/api/finance/holdings/${his.id}`)).status()).toBe(404);
  expect((await view(phil)).holdings.find((h) => h.id === his.id)!.value_pence).toBe(his.value_pence);
  expect((await tess.delete(`/api/finance/holdings/${hersId}`)).status()).toBe(200);
});

test("the page: nothing is in it until amounts are shown; then the figure is typed where it sits", async ({ page }) => {
  await page.goto("/finance/snapshot");
  const panel = page.getByTestId("net-worth");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("holding-row").first()).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain("Royal London");
  expect(html).not.toContain("300,000");
  expect(html).not.toContain("300000");
  expect(html).not.toContain("185,000");
  await expect(panel.getByRole("button", { name: "Add a holding" })).toBeDisabled();
  await expect(panel.locator("svg[aria-label='Net worth over time']")).toHaveCount(0);

  await page.getByRole("button", { name: "Show financial values" }).first().click();
  await expect(panel.locator("svg[aria-label='Net worth over time']")).toBeVisible();
  const row = panel.getByTestId("holding-row").filter({ hasText: `${RUN} The house` });
  await expect(row).toContainText("Property");
  await expect(panel.getByTestId("holding-row").filter({ hasText: `${RUN} Mortgage` })).toContainText("owed");
  const cell = row.getByLabel(`Figure for ${RUN} The house`);
  await expect(cell).toHaveValue("300000");
  const saved = page.waitForResponse((r) => r.url().includes("/api/finance/holdings/") && r.request().method() === "PATCH");
  await cell.fill("310000");
  await cell.press("Enter");
  expect((await saved).status()).toBe(200);
  await expect(row.getByTestId("holding-age")).toContainText("today");
  await expect(row.getByLabel(`Figure for ${RUN} The house`)).toHaveValue("310000");
  const house = (await view(phil)).holdings.find((h) => h.name === `${RUN} The house`)!;
  expect(house).toMatchObject({ value_pence: 31000000, figures: 2 });
});
