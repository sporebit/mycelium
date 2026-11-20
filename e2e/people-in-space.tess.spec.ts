/**
 * People belong to a space (master run §7, the test pass's fault): being in
 * a team with someone does not put them in your personal space. Tess and
 * Phil share one team here (made by SQL: creating a team through the app
 * would make Tess an owner, who then needs an authenticator, and her
 * account is shared by every suite). Everything asserted goes through the
 * app as Tess.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { PHIL, personalSpace, TESS } from "./support/users.ts";

const RUN = `E2E-pis-${Date.now().toString(36)}`;
const TEAM = randomUUID();
const TEAM_SPACE = randomUUID();
type Meta = { space_id: string; people: Array<{ id: string; name: string; spaces?: string[] }> };
type Made = { ticket?: { id: string; key: string | null; assignee: { id: string } | null }; error?: string };

const mention = (uid: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "For " }, { type: "mention", attrs: { id: uid, kind: "user", label: "Phil" } }] }],
});
const told = (uid: string, ticketId: string) => Number(localSql(`select count(*) from public.notifications where recipient_id = '${uid}' and ticket_id = '${ticketId}'`)[0][0]);
const watching = (uid: string, ticketId: string) => Number(localSql(`select count(*) from public.ticket_watchers where watcher_id = '${uid}' and ticket_id = '${ticketId}'`)[0][0]);
const create = async (request: APIRequestContext, body: Record<string, unknown>) => {
  const r = await request.post("/api/work/tickets", { data: body });
  return { status: r.status(), body: (await r.json()) as Made };
};

test.beforeAll(() => {
  localSql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', '${RUN} team', '${RUN.toLowerCase()}', '${PHIL.id}')`);
  localSql(`insert into public.spaces (id, kind, team_id) values ('${TEAM_SPACE}', 'team', '${TEAM}')`);
  localSql(`update public.teams set space_id = '${TEAM_SPACE}' where id = '${TEAM}'`);
  localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${PHIL.id}', 'owner'), ('${TEAM}', '${TESS.id}', 'member')`);
});

test.afterAll(() => {
  localSql(`delete from public.tickets where title like '${RUN}%'`);
  localSql(`delete from public.team_members where team_id = '${TEAM}'`);
  localSql(`update public.teams set space_id = null where id = '${TEAM}'`);
  localSql(`delete from public.spaces where id = '${TEAM_SPACE}'`);
  localSql(`delete from public.teams where id = '${TEAM}'`);
});

test("the people list says which spaces each person belongs to: a teammate is in the team's space, not in mine", async ({ request }) => {
  const meta = (await (await request.get("/api/work/meta")).json()) as Meta;
  const mine = personalSpace(TESS);
  expect(meta.space_id).toBe(mine);
  const me = meta.people.find((p) => p.id === TESS.id);
  const phil = meta.people.find((p) => p.id === PHIL.id);
  expect(me?.spaces).toEqual(expect.arrayContaining([mine, TEAM_SPACE]));
  expect(phil?.spaces, "Phil is offered where they both belong").toContain(TEAM_SPACE);
  expect(phil?.spaces, "and not in her own space").not.toContain(mine);
  expect(phil?.spaces).not.toContain(personalSpace(PHIL));
});

test("a ticket in my own space cannot be given to a teammate, at creation or afterwards; they are told nothing", async ({ request }) => {
  const refused = await create(request, { title: `${RUN} mine, for Phil`, assignee_id: PHIL.id });
  expect(refused.status, JSON.stringify(refused.body)).toBe(400);
  expect(refused.body.error).toBe("That person is not in this space.");
  expect(Number(localSql(`select count(*) from public.tickets where title = '${RUN} mine, for Phil'`)[0][0])).toBe(0);

  const made = await create(request, { title: `${RUN} mine`, assignee_id: TESS.id });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const key = made.body.ticket!.key ?? made.body.ticket!.id;
  const moved = await request.patch(`/api/work/tickets/${key}`, { data: { assignee_id: PHIL.id } });
  expect(moved.status()).toBe(400);
  expect(((await moved.json()) as { error: string }).error).toBe("That person is not in this space.");
  expect(localSql(`select assignee_id from public.tickets where id = '${made.body.ticket!.id}'`)[0][0]).toBe(TESS.id);
  expect(told(PHIL.id, made.body.ticket!.id)).toBe(0);
});

test("mentioning a teammate in my own space tells them nothing and does not make them a watcher", async ({ request }) => {
  const made = await create(request, { title: `${RUN} mine with a mention`, description_doc: mention(PHIL.id) });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.ticket!.id;
  expect(told(PHIL.id, id)).toBe(0);
  expect(watching(PHIL.id, id)).toBe(0);
  expect(watching(TESS.id, id), "she watches her own ticket as before").toBe(1);

  const said = await request.post(`/api/work/tickets/${made.body.ticket!.key ?? id}/comments`, { data: { body_doc: mention(PHIL.id) } });
  expect(said.status(), await said.text()).toBeLessThan(300);
  expect(told(PHIL.id, id)).toBe(0);
  expect(watching(PHIL.id, id)).toBe(0);
});

test("in the team's space the same things work: assigned, mentioned, told", async ({ request }) => {
  const made = await create(request, { title: `${RUN} team, for Phil`, space: TEAM_SPACE, assignee_id: PHIL.id, description_doc: mention(PHIL.id) });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.ticket!.id;
  expect(made.body.ticket!.assignee?.id).toBe(PHIL.id);
  expect(localSql(`select space_id from public.tickets where id = '${id}'`)[0][0]).toBe(TEAM_SPACE);
  expect(told(PHIL.id, id)).toBeGreaterThanOrEqual(1);
  expect(watching(PHIL.id, id)).toBe(1);
});
