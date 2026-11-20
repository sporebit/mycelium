/**
 * Sharing Day log entries (0169; master run §7), end to end. Tess is the
 * person shared with; Phil's side is driven with the API secret (which
 * acts as Phil). Phil's finished day and the share itself are written by
 * SQL (a real day needs an evening's conversation, and a real share needs
 * his authenticator; both are covered elsewhere). Marking the day shared,
 * and everything Tess sees, go through the app.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, personalSpace, TESS } from "./support/users.ts";

const RUN = `E2E-shared-${Date.now().toString(36)}`;
// A date nothing else uses.
const DATE = "2019-06-0" + (1 + (Date.now() % 9));
type Shared = { id: string; day: string; owner_name: string; summary: string | null; scenes: Array<{ title: string; narrative: string | null }> };

let phil: APIRequestContext;
let dayId = "";

test.beforeAll(async ({ playwright }) => {
  phil = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  const space = personalSpace(PHIL);
  localSql(`delete from public.daylog_days where day = '${DATE}' and space_id = '${space}'`);
  dayId = localSql(
    `insert into public.daylog_days (day, status, space_id, created_by, summary, closed_at) values ('${DATE}', 'closed', '${space}', '${PHIL.id}', '${RUN} a day at the allotment', now()) returning id`,
  )[0][0];
  localSql(`insert into public.daylog_scenes (day_id, space_id, created_by, title, position, narrative) values ('${dayId}', '${space}', '${PHIL.id}', '${RUN} digging', 0, 'Two beds turned over before the rain.')`);
});

test.afterAll(async () => {
  localSql(`delete from public.user_grants where reason = '${RUN}'`);
  localSql(`delete from public.daylog_days where id = '${dayId}'`);
  await phil.dispose();
});

const sharedWith = async (request: APIRequestContext) => ((await (await request.get("/api/journal/shared-days")).json()) as { days: Shared[] }).days.filter((d) => (d.summary ?? "").startsWith(RUN));

test("a day is private by default, and marking it shared shows nothing to someone he has not shared his Day log with", async ({ request }) => {
  const day = (await (await phil.get(`/api/journal/days/${DATE}`)).json()) as { day: { id: string; shared: boolean } };
  expect(day.day).toMatchObject({ id: dayId, shared: false });

  const marked = await phil.patch(`/api/journal/days/${DATE}`, { data: { shared: true } });
  expect(marked.status(), await marked.text()).toBe(200);
  expect(((await marked.json()) as { day: { shared: boolean } }).day.shared).toBe(true);
  expect(await sharedWith(request), "no share between them yet").toEqual([]);
  expect((await phil.patch(`/api/journal/days/${DATE}`, { data: { shared: "yes" } })).status()).toBe(400);
});

test("once he shares his Day log with her, she reads the marked day through its own list: his summary and scenes, nothing more", async ({ request }) => {
  localSql(
    `select set_config('request.jwt.claims', '{"sub":"${PHIL.id}","role":"authenticated","aal":"aal2"}', true); select public.create_user_grant_unchecked('${TESS.id}', 'journal', array['daylog'], array['view'], null, '${RUN}')`,
  );
  const days = await sharedWith(request);
  expect(days).toHaveLength(1);
  expect(days[0]).toMatchObject({ id: dayId, day: DATE, summary: `${RUN} a day at the allotment` });
  expect(days[0].scenes.map((s) => s.title)).toEqual([`${RUN} digging`]);
  expect(Object.keys(days[0]).sort()).toEqual(["day", "id", "owner_id", "owner_name", "scenes", "summary"]);

  // Her own journal is untouched by it: his day is not in her list, and the date opens HER day, not his.
  const mine = (await (await request.get(`/api/journal/days?from=${DATE}&to=${DATE}`)).json()) as { days: Array<{ id: string }> };
  expect(mine.days.map((d) => d.id)).not.toContain(dayId);
  const hers = (await (await request.get(`/api/journal/days/${DATE}`)).json()) as { day: { id: string } };
  expect(hers.day.id).not.toBe(dayId);
  localSql(`delete from public.daylog_days where id = '${hers.day.id}' and created_by = '${TESS.id}'`);
  // She cannot open his day by its id either, or change it.
  expect((await request.get(`/api/journal/days/${dayId}`)).status()).toBe(404);
  expect((await request.patch(`/api/journal/days/${dayId}`, { data: { shared: false } })).status()).toBe(404);
});

test("the journal page shows it under Shared with me", async ({ page }) => {
  await page.goto("/journal");
  const shared = page.getByTestId("daylog-shared");
  await expect(shared.getByRole("heading", { name: "Shared with me" })).toBeVisible();
  const entry = shared.locator("details").filter({ hasText: "1 scene" }).first();
  await entry.locator("summary").click();
  await expect(shared.getByText(`${RUN} a day at the allotment`)).toBeVisible();
  await expect(shared.getByText("Two beds turned over before the rain.")).toBeVisible();
});

test("taking the mark back closes it at once", async ({ request, page }) => {
  expect((await phil.patch(`/api/journal/days/${DATE}`, { data: { shared: false } })).status()).toBe(200);
  expect(await sharedWith(request)).toEqual([]);
  await page.goto("/journal");
  await expect(page.getByText(`${RUN} a day at the allotment`)).toHaveCount(0);
});
