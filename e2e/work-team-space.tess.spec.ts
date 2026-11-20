/**
 * A ticket in a team's space, as Tess (MYC-185): its page offers the team
 * space's issue types and projects, not her own; and the team's default
 * project has a key of its own, so the team's tickets read like the rest.
 *
 * The team is made by SQL, as in people-in-space: creating one through the
 * app would make Tess an owner, who then needs an authenticator.
 */
import { randomUUID } from "node:crypto";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { apiAs, expect, get, keyFor, newRunId, patientHook, PHIL, send, tag, TESS, test, watch, writeBudget } from "./work-kit.ts";

const RUN = newRunId();
const TAG = tag(RUN);
const TEAM = randomUUID();
const TEAM_SPACE = randomUUID();
const OWN_KEY = keyFor(RUN, "O");
const TEAM_KEY = keyFor(RUN, "T");

type Ticket = { id: string; key: string; space_id: string; project: { key: string; name: string } | null; type: { id: string; name: string } | null };
type Meta = { space_id: string; space_prefix: string | null; types: Array<{ id: string; name: string }>; projects: Array<{ id: string; key: string; name: string; is_default: boolean }> };

let tess: APIRequestContext;
let teamTicket: Ticket;
let ownTicket: Ticket;

const exactly = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
/** A row of the side panel, by its label. */
const side = (page: Page, label: string): Locator => page.locator("main aside > div").filter({ has: page.locator("span.uppercase", { hasText: exactly(label) }) });

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  patientHook();
  await writeBudget(TESS, 60);
  tess = await apiAs(TESS);
  // the name is what the key is made from: WH, or WH2 when a WH is already here
  localSql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', 'Whelan household', 'whelan-household-${RUN.toLowerCase()}', '${PHIL.id}')`);
  localSql(`insert into public.spaces (id, kind, team_id) values ('${TEAM_SPACE}', 'team', '${TEAM}')`);
  localSql(`update public.teams set space_id = '${TEAM_SPACE}' where id = '${TEAM}'`);
  localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${PHIL.id}', 'owner'), ('${TEAM}', '${TESS.id}', 'member')`);

  await send(tess, "POST", "/api/work/projects", { name: `${TAG} own project`, key: OWN_KEY });
  await send(tess, "POST", "/api/work/projects", { name: `${TAG} team project`, key: TEAM_KEY, space: TEAM_SPACE });
  await send(tess, "POST", "/api/work/types", { name: `${TAG} Team type`, space: TEAM_SPACE });
  teamTicket = (await send<{ ticket: Ticket }>(tess, "POST", "/api/work/tickets", { title: `${TAG} team ticket`, space: TEAM_SPACE })).ticket;
  ownTicket = (await send<{ ticket: Ticket }>(tess, "POST", "/api/work/tickets", { title: `${TAG} own ticket` })).ticket;
});

test.afterAll(async () => {
  patientHook();
  await tess.delete(`/api/work/tickets/${ownTicket.id}?hard=1`);
  await tess.delete(`/api/work/projects/${OWN_KEY}`);
  localSql(`delete from public.tickets where space_id = '${TEAM_SPACE}'`);
  localSql(`delete from public.team_members where team_id = '${TEAM}'`);
  localSql(`update public.teams set space_id = null where id = '${TEAM}'`);
  localSql(`delete from public.spaces where id = '${TEAM_SPACE}'`);
  localSql(`delete from public.teams where id = '${TEAM}'`);
  await tess.dispose();
});

test("a team's space takes a key from the team's name; its default project answers to it and its tickets read like the rest", async () => {
  const meta = await get<Meta>(tess, `/api/work/meta?space=${TEAM_SPACE}`);
  expect(meta.space_id).toBe(TEAM_SPACE);
  expect(meta.space_prefix, "initials of the team's name, unique").toMatch(/^WH\d*$/);
  const general = meta.projects.find((p) => p.is_default);
  expect(general?.key, "the default project's key is the space's").toBe(meta.space_prefix);
  expect(teamTicket.key).toMatch(new RegExp(`^${meta.space_prefix}-\\d+$`));
  expect(teamTicket.key).not.toMatch(/^TKT-/);
  // the key opens it, and so does the default project's
  expect((await get<{ ticket: Ticket }>(tess, `/api/work/tickets/${teamTicket.key}`)).ticket.id).toBe(teamTicket.id);
  expect((await get<{ project: { id: string } }>(tess, `/api/work/projects/${meta.space_prefix}`)).project.id).toBe(general!.id);
  // her own space is untouched by it
  const own = await get<Meta>(tess, "/api/work/meta");
  expect(own.space_prefix).not.toBe(meta.space_prefix);
});

test("the team ticket's page offers the team space's types and projects, and none of her own", async ({ page }, testInfo) => {
  watch(page, testInfo);
  await page.goto(`/work/browse/${teamTicket.key}`);
  await expect(page.locator("main")).toContainText(teamTicket.key);

  await side(page, "Project").getByRole("button").click();
  const projects = page.getByRole("listbox", { name: "Project" });
  await expect(projects.getByRole("option", { name: `${TAG} team project` })).toBeVisible();
  await expect(projects.getByRole("option", { name: `${TAG} own project` })).toHaveCount(0);
  await expect(projects.getByRole("option", { name: TEAM_KEY })).toHaveCount(1);
  await projects.getByRole("option", { name: `${TAG} team project` }).click();
  await expect(side(page, "Project").getByRole("button")).toContainText(`${TAG} team project`);
  await expect.poll(async () => (await get<{ ticket: Ticket }>(tess, `/api/work/tickets/${teamTicket.id}`)).ticket.project?.key).toBe(TEAM_KEY);

  await side(page, "Type").getByRole("button").click();
  const types = page.getByRole("listbox", { name: "Type" });
  await expect(types.getByRole("option", { name: `${TAG} Team type` })).toBeVisible();
  await types.getByRole("option", { name: `${TAG} Team type` }).click();
  await expect(side(page, "Type").getByRole("button")).toContainText(`${TAG} Team type`);
  await expect.poll(async () => (await get<{ ticket: Ticket }>(tess, `/api/work/tickets/${teamTicket.id}`)).ticket.type?.name).toBe(`${TAG} Team type`);
});

test("her own ticket's page is dressed in her own space: her project, not the team's type", async ({ page }, testInfo) => {
  watch(page, testInfo);
  await page.goto(`/work/browse/${ownTicket.key}`);
  await expect(page.locator("main")).toContainText(ownTicket.key);
  await side(page, "Project").getByRole("button").click();
  const projects = page.getByRole("listbox", { name: "Project" });
  await expect(projects.getByRole("option", { name: `${TAG} own project` })).toBeVisible();
  await expect(projects.getByRole("option", { name: `${TAG} team project` })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await side(page, "Type").getByRole("button").click();
  await expect(page.getByRole("listbox", { name: "Type" }).getByRole("option", { name: `${TAG} Team type` })).toHaveCount(0);
});
