/**
 * Nudges (master run §7; research rule 30), end to end. Tess is the one
 * nudging; Phil's side is driven with the API secret (which acts as Phil).
 *
 * The share that lets her see his ticket is written by SQL: creating one
 * through the app needs Phil's authenticator and a fresh confirmation,
 * which the multi-user suite covers. Everything after that goes through
 * the app.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_CRON_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, personalSpace, TESS } from "./support/users.ts";

const RUN = `E2E-nudge-${Date.now().toString(36)}`;
let phil: APIRequestContext;
let cron: APIRequestContext;
let philsTicket = { id: "", key: "" };
let grantId = "";

const nudgesFor = (ticketId: string) => localSql(`select from_user::text, preset, wording, coalesce(answer, ''), space_id::text from public.nudges where ticket_id = '${ticketId}' order by at`);

test.beforeAll(async ({ playwright }) => {
  phil = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  cron = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  const res = await phil.post("/api/tickets", { data: { title: `${RUN} reply about the boiler quote`, category: "next" } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  const body = (await res.json()) as { ticket?: { id: string; ticket_key: string }; task?: { id: string; ticket_key: string } };
  const t = body.ticket ?? body.task!;
  philsTicket = { id: t.id, key: t.ticket_key };
});

test.afterAll(async () => {
  if (grantId) localSql(`delete from public.user_grants where id = '${grantId}'`);
  localSql(`delete from public.interruptions where kind in ('nudge', 'nudge_done') and (title like '%${RUN}%' or body like '%${RUN}%')`);
  localSql(`delete from public.tickets where title like '${RUN}%'`);
  await phil.dispose();
  await cron.dispose();
});

test("she cannot nudge what she cannot see: no button, and no sign that it exists", async ({ request }) => {
  const can = (await (await request.get(`/api/nudges?ticket=${philsTicket.id}`)).json()) as { can_nudge: boolean };
  expect(can.can_nudge).toBe(false);
  const res = await request.post("/api/nudges", { data: { ticket_id: philsTicket.id, preset: "company" } });
  expect(res.status()).toBe(404);
  expect(nudgesFor(philsTicket.id)).toEqual([]);
});

test("once he shares his tickets with her, one tap sends him an offer, outside his interruption budget", async ({ request }) => {
  grantId = localSql(
    `select set_config('request.jwt.claims', '{"sub":"${PHIL.id}","role":"authenticated","aal":"aal2"}', true); select public.create_user_grant_unchecked('${TESS.id}', 'organisation', array['tickets'], array['view'], null, '${RUN}')`,
  ).at(-1)![0];

  const can = (await (await request.get(`/api/nudges?ticket=${philsTicket.id}`)).json()) as { can_nudge: boolean; presets: Array<{ key: string; label: string }> };
  expect(can.can_nudge).toBe(true);
  expect(can.presets.map((p) => p.key)).toEqual(["company", "help", "together", "thinking"]);

  const before = Number(localSql(`select count(*) from public.interruptions where created_by = '${PHIL.id}' and counted`)[0][0]);
  const sent = await request.post("/api/nudges", { data: { ticket_id: philsTicket.id, preset: "company" } });
  expect(sent.status(), await sent.text()).toBe(201);

  // The nudge is his: in his space, in the fixed words, naming her.
  const rows = nudgesFor(philsTicket.id);
  expect(rows).toHaveLength(1);
  expect(rows[0][0]).toBe(TESS.id);
  expect(rows[0][1]).toBe("company");
  expect(rows[0][2]).toMatch(/want company for ".*boiler quote"\?$/);
  expect(rows[0][4]).toBe(personalSpace(PHIL));

  // It reached for him as a person, not as the app: recorded, never counted.
  const ledger = localSql(`select origin, counted::text from public.interruptions where created_by = '${PHIL.id}' and kind = 'nudge' and ticket_id = '${philsTicket.id}'`);
  for (const row of ledger) expect(row).toEqual(["person", "false"]);
  expect(Number(localSql(`select count(*) from public.interruptions where created_by = '${PHIL.id}' and counted`)[0][0]), "his budget is untouched").toBe(before);

  // There is no limit: a second one goes too.
  expect((await request.post("/api/nudges", { data: { ticket_id: philsTicket.id, preset: "help" } })).status()).toBe(201);
});

test("only the fixed wordings can be sent, and nobody nudges themselves", async ({ request }) => {
  expect((await request.post("/api/nudges", { data: { ticket_id: philsTicket.id, preset: "you still haven't done this" } })).status()).toBe(400);
  expect((await request.post("/api/nudges", { data: { ticket_id: philsTicket.id } })).status()).toBe(400);
  expect((await request.post("/api/nudges", { data: { ticket_id: "not-a-ticket", preset: "company" } })).status()).toBe(400);

  const own = await request.post("/api/tickets", { data: { title: `${RUN} her own`, category: "next" } });
  const body = (await own.json()) as { ticket?: { id: string }; task?: { id: string } };
  const ownId = (body.ticket ?? body.task!).id;
  expect(((await (await request.get(`/api/nudges?ticket=${ownId}`)).json()) as { can_nudge: boolean }).can_nudge).toBe(false);
  const res = await request.post("/api/nudges", { data: { ticket_id: ownId, preset: "company" } });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toBe("That one is yours.");
});

test("he sees them, and Not today is one tap that tells nobody; she cannot read or answer his", async ({ request }) => {
  const mine = (await (await phil.get("/api/nudges")).json()) as { open: Array<{ id: string; from: string; text: string; ticket_id: string }> };
  const open = mine.open.filter((n) => n.ticket_id === philsTicket.id);
  expect(open).toHaveLength(2);
  expect(open.every((n) => n.text.includes("boiler quote"))).toBe(true);

  // Her own list holds nothing of his, and she cannot answer one of his.
  const hers = (await (await request.get("/api/nudges")).json()) as { open: Array<{ ticket_id: string }> };
  expect(hers.open.filter((n) => n.ticket_id === philsTicket.id)).toEqual([]);
  expect((await request.post(`/api/nudges/${open[0].id}`, { data: { action: "not_today" } })).status()).toBe(404);

  const toldBefore = Number(localSql(`select count(*) from public.interruptions where created_by = '${TESS.id}'`)[0][0]);
  const res = await phil.post(`/api/nudges/${open[0].id}`, { data: { action: "not_today" } });
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { open: Array<{ id: string }> }).open.map((n) => n.id)).not.toContain(open[0].id);
  expect(Number(localSql(`select count(*) from public.interruptions where created_by = '${TESS.id}'`)[0][0]), "she hears nothing about Not today").toBe(toldBefore);
  expect((await phil.post(`/api/nudges/${open[0].id}`, { data: { action: "not_today" } })).status(), "already answered").toBe(404);
  expect((await phil.post(`/api/nudges/${open[1].id}`, { data: { action: "ignore" } })).status()).toBe(400);
});

test("when he finishes it she is told, once", async () => {
  expect((await phil.post(`/api/tickets/${philsTicket.key}/move`, { data: { category: "done" } })).status()).toBe(200);
  // The test server has no push or Telegram to deliver with, so what is checked is the telling itself: each
  // of her nudges is marked told, exactly once, and nothing she receives is ever counted against a budget.
  const untold = () => Number(localSql(`select count(*) from public.nudges where ticket_id = '${philsTicket.id}' and done_told_at is null`)[0][0]);
  expect(untold()).toBe(2);

  const tick = (await (await cron.get("/api/cron/daily-prompts")).json()) as { ok: boolean; nudges_told: number };
  expect(tick.ok).toBe(true);
  // Both are told: the one still open, and the one he set aside (the thing she asked about is done either way).
  expect(tick.nudges_told).toBe(2);
  expect(untold()).toBe(0);
  expect(localSql(`select coalesce(answer, ''), count(*)::text from public.nudges where ticket_id = '${philsTicket.id}' group by 1 order by 1`)).toEqual([
    ["done", "1"],
    ["not_today", "1"],
  ]);
  expect(Number(localSql(`select count(*) from public.interruptions where created_by = '${TESS.id}' and kind = 'nudge_done' and counted`)[0][0])).toBe(0);

  const again = (await (await cron.get("/api/cron/daily-prompts")).json()) as { nudges_told: number };
  expect(again.nudges_told, "a second tick tells her nothing new").toBe(0);

  // A finished thing cannot be nudged, and none are left waiting for him.
  const open = (await (await phil.get("/api/nudges")).json()) as { open: Array<{ ticket_id: string }> };
  expect(open.open.filter((n) => n.ticket_id === philsTicket.id)).toEqual([]);
});
