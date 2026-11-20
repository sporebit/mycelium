/**
 * Two spaces, one address (the test pass's fault; master run §7). Every
 * space starts with a doc space "HOME" and a project "General", so someone
 * in a team saw two identical cards and one link. Now a doc space has an
 * address that means one thing to the reader, and Docs and Projects say
 * whose space a thing is in. Tess and Phil share a team made by SQL (see
 * people-in-space for why); everything asserted goes through the app as
 * Tess.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { PHIL, personalSpace, TESS } from "./support/users.ts";

const RUN = `E2E-whose-${Date.now().toString(36)}`;
const TEAM = randomUUID();
const TEAM_SPACE = randomUUID();
const TEAM_NAME = `${RUN} family`;
type DocSpace = { id: string; key: string; name: string; space_id: string; ref?: string; owner?: string };
type Projects = { projects: Array<{ id: string; name: string; key: string; space_id: string }>; spaces: Array<{ id: string; label: string; own: boolean }>; categories: Array<{ name: string; space_id?: string | null; projects: unknown[] }> };

let teamHome: DocSpace;
let myHome: DocSpace;
let teamPage = "";

test.beforeAll(() => {
  localSql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', '${TEAM_NAME}', '${RUN.toLowerCase()}', '${PHIL.id}')`);
  localSql(`insert into public.spaces (id, kind, team_id) values ('${TEAM_SPACE}', 'team', '${TEAM}')`);
  localSql(`update public.teams set space_id = '${TEAM_SPACE}' where id = '${TEAM}'`);
  localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${PHIL.id}', 'owner'), ('${TEAM}', '${TESS.id}', 'member')`);
});

test.afterAll(() => {
  localSql(`delete from public.doc_pages where space_id = '${TEAM_SPACE}'`);
  localSql(`delete from public.doc_spaces where space_id = '${TEAM_SPACE}'`);
  localSql(`delete from public.tickets where space_id = '${TEAM_SPACE}'`);
  localSql(`delete from public.team_members where team_id = '${TEAM}'`);
  localSql(`update public.teams set space_id = null where id = '${TEAM}'`);
  localSql(`delete from public.spaces where id = '${TEAM_SPACE}'`);
  localSql(`delete from public.teams where id = '${TEAM}'`);
});

test("two doc spaces called HOME get two addresses: mine keeps its key, the team's is reached by its id", async ({ request }) => {
  const { spaces } = (await (await request.get("/api/work/docs/spaces")).json()) as { spaces: DocSpace[] };
  const homes = spaces.filter((s) => s.key === "HOME" && [personalSpace(TESS), TEAM_SPACE].includes(s.space_id));
  expect(homes).toHaveLength(2);
  myHome = homes.find((s) => s.space_id === personalSpace(TESS))!;
  teamHome = homes.find((s) => s.space_id === TEAM_SPACE)!;
  expect(myHome).toMatchObject({ ref: "HOME", owner: "Yours" });
  expect(teamHome).toMatchObject({ ref: teamHome.id, owner: TEAM_NAME });

  const mine = (await (await request.get("/api/work/docs/spaces/HOME")).json()) as { space: DocSpace };
  expect(mine.space.id).toBe(myHome.id);
  const theirs = (await (await request.get(`/api/work/docs/spaces/${teamHome.ref}`)).json()) as { space: DocSpace };
  expect(theirs.space).toMatchObject({ id: teamHome.id, space_id: TEAM_SPACE, ref: teamHome.id });
});

test("the Docs page says whose each one is, and each card opens its own", async ({ page }) => {
  await page.goto("/docs");
  const cards = page.getByTestId("doc-space-card");
  const mine = cards.filter({ hasText: "· Yours" });
  const theirs = cards.filter({ hasText: `· ${TEAM_NAME}` });
  await expect(mine).toHaveCount(1);
  await expect(theirs).toHaveCount(1);
  expect(await mine.getAttribute("href")).toBe("/docs/HOME");
  expect(await theirs.getAttribute("href")).toBe(`/docs/${teamHome.id}`);
  await theirs.click();
  await expect(page).toHaveURL(new RegExp(`/docs/${teamHome.id}`));
  await expect(page.getByText("Could not load this doc space.")).toHaveCount(0);
});

test("a page made in the team's doc space lands there, and a link made under the wrong HOME finds its way", async ({ request, page }) => {
  const made = await request.post("/api/work/docs/pages", { data: { doc_space: teamHome.id, title: `${RUN} team page` } });
  expect(made.status(), await made.text()).toBe(201);
  teamPage = ((await made.json()) as { page: { id: string; doc_space_id: string; doc_space_key: string } }).page.id;
  const read = (await (await request.get(`/api/work/docs/pages/${teamPage}`)).json()) as { page: { doc_space_id: string; doc_space_key: string } };
  expect(read.page.doc_space_id).toBe(teamHome.id);
  expect(read.page.doc_space_key, "the address a link should use").toBe(teamHome.id);

  // the address someone else would have written, where HOME meant their own
  await page.goto(`/docs/HOME/${teamPage}`);
  await expect(page).toHaveURL(new RegExp(`/docs/${teamHome.id}/${teamPage}`));
  await expect(page.getByRole("heading", { name: `${RUN} team page` })).toBeVisible();
});

test("Projects says whose each group is, puts mine first and shows no id as a key", async ({ request, page }) => {
  const list = (await (await request.get("/api/work/projects")).json()) as Projects;
  const labels = list.spaces.filter((s) => [personalSpace(TESS), TEAM_SPACE].includes(s.id));
  expect(labels.map((s) => s.label)).toEqual(["Yours", TEAM_NAME]);
  expect(list.spaces[0]).toMatchObject({ id: personalSpace(TESS), own: true });
  expect(list.projects.some((p) => p.space_id === TEAM_SPACE && p.name === "General")).toBe(true);

  await page.goto("/work/projects");
  const groups = page.getByTestId("project-group");
  await expect(groups.filter({ hasText: `· ${TEAM_NAME}` }).first()).toBeVisible();
  await expect(groups.filter({ hasText: "· Yours" }).first()).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  // mine comes before the team's
  expect(text.indexOf("· Yours")).toBeLessThan(text.indexOf(`· ${TEAM_NAME}`));
});
