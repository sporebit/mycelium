/**
 * Features gone quiet (master run §6), as Tess: read from the rows a
 * feature keeps, each against its own rhythm, shown on the dashboard and
 * dimmed in the navigation. Places is used because no other suite touches
 * it: its rhythm is 120 days.
 *
 * Rows are seeded by SQL with old dates (no route can backdate a row).
 */
import { expect, test } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { personalSpace, TESS } from "./support/users.ts";

const RUN = `E2E-dormant-${Date.now().toString(36)}`;
type Quiet = { key: string; label: string; href: string; state: string; how_long: string | null; days_quiet: number | null };
type View = { ok: boolean; quiet: Quiet[]; hrefs: string[]; question: string | null };

function place(daysAgo: number): string {
  const at = `now() - interval '${daysAgo} days'`;
  return localSql(
    `insert into public.places (name, space_id, created_by, created_at, updated_at) values ('${RUN} ${daysAgo}', '${personalSpace(TESS)}', '${TESS.id}', ${at}, ${at}) returning id`,
  )[0][0];
}

const clear = () => localSql(`delete from public.places where created_by = '${TESS.id}'`);
test.beforeEach(clear);
test.afterAll(clear);

test("a feature never used is not listed; one used long ago is, with how long; using it again clears it", async ({ request }) => {
  const dormant = async () => (await (await request.get("/api/dormant")).json()) as View;

  expect((await dormant()).quiet.map((q) => q.key), "never used: nothing to have stopped").not.toContain("places");

  const old = place(200);
  let view = await dormant();
  const places = view.quiet.find((q) => q.key === "places");
  expect(places).toMatchObject({ label: "Places", href: "/places", state: "quiet", how_long: "7 months" });
  expect(view.hrefs).toContain("/places");
  expect(view.question).toMatch(/has not been touched for .+\. Why\? Keep it, pause it, or retire it\./);

  // Inside its rhythm: 100 days is not quiet for something done a few times a year.
  place(100);
  view = await dormant();
  expect(view.quiet.map((q) => q.key)).not.toContain("places");
  expect(view.hrefs).not.toContain("/places");

  // An edit counts as much as an addition.
  clear();
  place(300);
  expect((await dormant()).quiet.map((q) => q.key)).toContain("places");
  localSql(`update public.places set updated_at = now() where created_by = '${TESS.id}'`);
  expect((await dormant()).quiet.map((q) => q.key)).not.toContain("places");
  expect(old).toBeTruthy();
});

test("the database answers only for the caller's own rows, and only for registered tables", async () => {
  place(200);
  const asTess = (sql: string) =>
    localSql(`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${TESS.id}","role":"authenticated","aal":"aal1"}', true); ${sql}`);
  // The same call as another person sees nothing of Tess's place.
  const other = localSql(
    `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000dead","role":"authenticated","aal":"aal1"}', true); select coalesce(last_at::text, 'none') from public.feature_activity(array['places'])`,
  );
  expect(other.at(-1)?.[0]).toBe("none");
  expect(asTess(`select (last_at is not null)::text from public.feature_activity(array['places'])`).at(-1)?.[0]).toBe("true");
  // A table that is not in the registry is ignored, not read.
  expect(asTess(`select count(*) from public.feature_activity(array['pg_authid', 'auth.users', 'no_such_table'])`).at(-1)?.[0]).toBe("0");
});

test("the dashboard lists it and the navigation dims it", async ({ page }) => {
  place(200);
  await page.goto("/");
  const card = page.getByTestId("gone-quiet");
  await expect(card.getByRole("link", { name: /Places/ })).toContainText("untouched for 7 months");
  await expect(card.getByRole("link", { name: /Places/ })).toHaveAttribute("href", "/places");
  // Nothing softer or harsher than the fact.
  await expect(card).not.toContainText(/overdue|missed|you still haven|don't forget|neglect/i);
});
