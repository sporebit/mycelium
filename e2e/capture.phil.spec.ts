/**
 * Typed capture (MYC-161), the review queue and capture learning (0138),
 * as Phil — written the day before the capture pipeline is rebuilt, so it
 * pins what the pipeline does today:
 *
 *   - every entity in the form registry: what it refuses, what a submit
 *     answers, where the capture waits, what APPROVE makes of it;
 *   - approve / re-route / discard on a typed capture, in the browser;
 *   - one row per client_uuid;
 *   - the learning row (predicted vs chosen vs approved);
 *   - Auto (untyped) capture with cloud AI off: the regex fallback.
 *
 * Checks marked fixme are things the pipeline gets wrong today; each names
 * its finding and holds the behaviour the rebuild should have.
 */
import { test, type APIRequestContext, type Page } from "@playwright/test";
import { expect } from "./daylog.helpers.ts";
import { localSql } from "../lib/access/introspect.ts";
import { ENTITY_REGISTRY, TYPED_KINDS, type TypedKind } from "../lib/capture/registry.ts";
import { NO_SESSION, appToday, json, readDay, tag, watch } from "./daylog.helpers.ts";

const T = tag("capture");


type Fields = Record<string, unknown>;
type TypedAnswer = { ok: boolean; typed: boolean; kind: string; title: string; routed_to: string; routed_id: string; ticket_key: string | null; review: "tickets_inbox" | "captures"; capture_id: string };
type Capture = { id: string; source: string; raw_text: string; classification: Record<string, unknown>; llm_source: string; routed_to: string; routed_id: string; reviewed_at: string | null; discarded_at: string | null; created_at: string };
type Reviewed = { ok: boolean; action: string; capture: { id: string; classification: Record<string, unknown>; routed_to: string; routed_id: string; reviewed_at: string | null; discarded_at: string | null } };

let api: APIRequestContext;
/** Rows a capture became, to remove through the app's own delete routes. */
const made: Array<{ table: string; id: string }> = [];
const captures: string[] = [];
let projectId = "";
let projectPrefix = "";
let personId = "";
let todayExisted = true;

const DELETE_ROUTE: Record<string, (id: string) => string> = {
  tickets: (id) => `/api/tickets/${id}?hard=1`,
  purchases: (id) => `/api/purchases/${id}`,
  media_items: (id) => `/api/media/${id}`,
  quotes: (id) => `/api/quotes/${id}`,
  accounts: (id) => `/api/finance/service-accounts/${id}`,
  exercise_pain_logs: (id) => `/api/fitness/pain-logs/${id}`,
};

test.beforeAll(async ({ playwright }, info) => {
  const setup = await playwright.request.newContext({ baseURL: info.project.use.baseURL, storageState: info.project.use.storageState as string });
  // a Tickets (technical) project for the Ticket type, and a person for the Person update type
  const areas = await json<{ areas: Array<{ id: string; kind: string }> }>(await setup.get("/api/areas"));
  const technical = areas.areas.find((a) => a.kind === "technical");
  expect(technical, "Phil has a Technical area").toBeTruthy();
  projectPrefix = `E${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const proj = await setup.post("/api/projects", { data: { name: `${T} project`, prefix: projectPrefix, area_id: technical!.id } });
  expect(proj.status(), await proj.text()).toBe(200);
  projectId = (await json<{ project: { id: string } }>(proj)).project.id;
  const person = await setup.post("/api/people", { data: { first_name: `${T}-Person` } });
  expect(person.status(), await person.text()).toBe(200);
  personId = (await json<{ person: { id: string } }>(person)).person.id;
  const today = await appToday(setup);
  todayExisted = (await json<{ days: unknown[] }>(await setup.get(`/api/journal/days?from=${today}&to=${today}`))).days.length > 0;
  await setup.dispose();
});

test.beforeEach(({ request }) => {
  api = request;
});

test.afterEach(async () => {
  for (const m of made.splice(0)) if (DELETE_ROUTE[m.table]) await api.delete(DELETE_ROUTE[m.table](m.id));
  for (const id of captures.splice(0)) await api.delete(`/api/captures/${id}`);
});

test.afterAll(async ({ playwright }, info) => {
  const teardown = await playwright.request.newContext({ baseURL: info.project.use.baseURL, storageState: info.project.use.storageState as string });
  if (projectId) await teardown.delete(`/api/projects/${projectId}?hard=true`);
  if (personId) await teardown.delete(`/api/people/${personId}?hard=1`);
  // a Journal capture is appended to today's Day log; remove that row only if this spec made it and nothing else is in it
  if (!todayExisted) {
    const today = await appToday(teardown);
    const res = await teardown.get(`/api/journal/days/${today}`);
    if (res.ok()) {
      const d = (await json<{ day: { transcript: Array<{ role: string; text: string }> } }>(res)).day;
      if (d.transcript.every((e) => e.role !== "user" || e.text.includes("E2E-capture-"))) await teardown.delete(`/api/journal/days/${today}`);
    }
  }
  await teardown.dispose();
});

// ---------------------------------------------------------------------------
// the registry, one fixture per entity
// ---------------------------------------------------------------------------

type Fixture = {
  /** A form that passes validation. */
  valid: () => Fields;
  /** A form that does not, and the per-field messages it must be answered with. */
  invalid: Fields;
  errors: Record<string, string>;
  /** The field whose value becomes the capture's text. */
  text: (f: Fields) => string;
  /** The title the answer carries. */
  title: (f: Fields) => string;
  /** Where APPROVE files it. `raw_captures` = it stays a capture. */
  lands: string;
  /** SQL that reads back the wording from the row APPROVE made. */
  readBack?: (id: string) => string;
};

const s = (v: unknown) => String(v ?? "");

const FIXTURES: Record<TypedKind, Fixture> = {
  task: {
    valid: () => ({ title: `${T} task fix the gate`, description: "the latch sticks", due_window: "week", key: true, tags: ["e2e"] }),
    invalid: { title: "  ", due_window: "date" },
    errors: { title: "Title is required", deadline_on: "Pick the date" },
    text: (f) => s(f.title),
    title: (f) => s(f.title),
    lands: "tickets",
  },
  ticket: {
    valid: () => ({ title: `${T} ticket rotate the keys`, description: "", project_id: projectId, due_window: "" }),
    invalid: { title: `${T} ticket without a project` },
    errors: { project_id: "A ticket needs a Tickets project" },
    text: (f) => s(f.title),
    title: (f) => s(f.title),
    lands: "tickets",
  },
  reminder: {
    valid: () => ({ message: `${T} reminder call the dentist`, date: "2031-01-15", time: "09:30", recurrence: "" }),
    invalid: { message: `${T} reminder with no time` },
    errors: { date: "Date", time: "Time" },
    text: (f) => s(f.message),
    title: (f) => s(f.message),
    lands: "tickets",
    readBack: (id) => `select title || '|' || kind || '|' || to_char(remind_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') from public.tickets where id = '${id}'`,
  },
  purchase: {
    valid: () => ({ title: `${T} purchase batteries`, list_type: "shopping", amount: "4.50", currency: "", want_or_need: "need", urgency: "this_week", category: "home" }),
    invalid: { title: "", amount: "lots" },
    errors: { title: "Item is required", amount: "Number" },
    text: (f) => s(f.title),
    title: (f) => s(f.title),
    lands: "purchases",
    readBack: (id) => `select title || '|' || amount || '|' || currency || '|' || want_or_need || '|' || urgency || '|' || list_type || '|' || category from public.purchases where id = '${id}'`,
  },
  media: {
    valid: () => ({ title: `${T} media a long book`, media_type: "read", creator: "A. Writer", media_status: "backlog", url: "", tags: [], notes: "" }),
    invalid: { title: `${T} media with no type` },
    errors: { media_type: "Watch, listen or read" },
    text: (f) => s(f.title),
    title: (f) => s(f.title),
    lands: "media_items",
    readBack: (id) => `select title || '|' || media_type || '|' || creator || '|' || media_status from public.media_items where id = '${id}'`,
  },
  quote: {
    valid: () => ({ text: `${T} quote never trust a quiet server`, said_by_person_id: "__me", context: "e2e", source: "", said_at: "", merch: false }),
    invalid: { text: "   " },
    errors: { text: "The quote is required" },
    text: (f) => s(f.text),
    title: (f) => s(f.text),
    lands: "quotes",
    readBack: (id) => `select text || '|' || is_own || '|' || coalesce(context, '') from public.quotes where id = '${id}'`,
  },
  account: {
    valid: () => ({ name: `${T} account Streamy`, status: "trial", category: "Other", cost_amount: "9.99", cost_period: "monthly", cost_currency: "" }),
    invalid: { name: "", cost_amount: "x" },
    errors: { name: "Service name is required", cost_amount: "Number" },
    text: (f) => s(f.name),
    title: (f) => s(f.name),
    lands: "accounts",
    readBack: (id) => `select name || '|' || status || '|' || cost_amount || '|' || cost_period || '|' || cost_currency from public.accounts where id = '${id}'`,
  },
  pain_log: {
    valid: () => ({ notes: `${T} pain left knee on the stairs`, pain_regions: ["knee"], severity: "4", feel_rating: "mild" }),
    invalid: { notes: `${T} pain with nothing else`, severity: "11" },
    errors: { pain_regions: "At least one region", severity: "0 to 10" },
    text: (f) => s(f.notes),
    title: () => "knee 4",
    lands: "exercise_pain_logs",
    readBack: (id) => `select notes || '|' || severity || '|' || feel_rating || '|' || array_to_string(pain_regions, ',') || '|' || exercise_name from public.exercise_pain_logs where id = '${id}'`,
  },
  journal: {
    valid: () => ({ text: `${T} journal a slow morning`, mood: "calm" }),
    invalid: { text: "" },
    errors: { text: "Write something" },
    text: (f) => s(f.text),
    title: (f) => s(f.text).slice(0, 80),
    lands: "daylog_days",
  },
  decision: captureOnly("decision", "Decision"),
  idea: captureOnly("idea", "Idea"),
  note: captureOnly("note", "Note"),
  workout: captureOnly("workout", "Workout"),
  person: {
    valid: () => ({ person_id: personId, notes: `${T} person takes tea without milk`, relationship: "friend" }),
    invalid: { person_id: "", notes: "" },
    errors: { person_id: "Pick the person", notes: "Give at least one thing to update" },
    text: (f) => s(f.notes),
    title: (f) => s(f.notes),
    lands: "people",
    readBack: (id) => `select coalesce(relationship, '') || '|' || coalesce(notes, '') from public.people where id = '${id}'`,
  },
};

function captureOnly(kind: string, label: string): Fixture {
  return {
    valid: () => ({ title: `${T} ${kind} kept as a capture`, summary: "some detail", tags: ["e2e"] }),
    invalid: { title: "", summary: "detail without a title" },
    errors: { title: `${label} is required` },
    text: (f) => s(f.title),
    title: (f) => s(f.title),
    lands: "raw_captures",
  };
}

async function submitTyped(kind: string, fields: Fields, extra: Record<string, unknown> = {}): Promise<TypedAnswer> {
  const res = await api.post("/api/capture", { data: { typed: { kind, fields }, ...extra } });
  expect(res.status(), `typed ${kind} → ${(await res.text()).slice(0, 200)}`).toBe(200);
  const body = await json<TypedAnswer>(res);
  captures.push(body.capture_id);
  if (body.routed_to !== "raw_captures") made.push({ table: body.routed_to, id: body.routed_id });
  return body;
}

async function queue(tab: "needs_review" | "all" = "needs_review"): Promise<Capture[]> {
  const res = await api.get(`/api/captures/review?tab=${tab}&limit=200`);
  expect(res.status()).toBe(200);
  return (await json<{ captures: Capture[] }>(res)).captures;
}

async function review(id: string, body: Record<string, unknown>): Promise<Reviewed> {
  const res = await api.patch(`/api/captures/${id}/review`, { data: body });
  expect(res.status(), `review ${JSON.stringify(body).slice(0, 80)} → ${(await res.text()).slice(0, 200)}`).toBe(200);
  const out = await json<Reviewed>(res);
  if (out.capture.routed_to && out.capture.routed_to !== "raw_captures") made.push({ table: out.capture.routed_to, id: out.capture.routed_id });
  return out;
}

type Learning = { predicted_kind: string | null; predicted_llm_source: string | null; chosen_kind: string | null; chosen_fields: Fields | null; approved_kind: string | null; approved_fields: Fields | null; approved_at: string | null; source: string; text: string };
function learning(captureId: string): Learning | null {
  const row = localSql(`select row_to_json(l) from public.capture_learning l where capture_id = '${captureId}'`)[0];
  return row ? (JSON.parse(row[0]) as Learning) : null;
}

// ---------------------------------------------------------------------------

test.describe("Typed capture · every entity in the registry", () => {
  test("the fixtures cover the registry, in the order the form offers it", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...TYPED_KINDS].sort());
    expect(Object.keys(ENTITY_REGISTRY).sort()).toEqual([...TYPED_KINDS].sort());
    expect([...TYPED_KINDS]).toEqual(["task", "ticket", "reminder", "purchase", "media", "quote", "journal", "idea", "decision", "note", "person", "account", "pain_log", "workout"]);
  });

  for (const kind of TYPED_KINDS) {
    test(`${kind}: refused with a message per field, and nothing is stored`, async () => {
      const fx = FIXTURES[kind];
      const res = await api.post("/api/capture", { data: { typed: { kind, fields: fx.invalid } } });
      expect(res.status()).toBe(400);
      const body = await json<{ error: string; errors: Record<string, string> }>(res);
      expect(body.errors).toEqual(fx.errors);
      expect(body.error).toBe(Object.values(fx.errors)[0]);
      const marker = Object.values(fx.invalid).find((v) => typeof v === "string" && v.startsWith(T));
      if (marker) expect((await queue("all")).filter((c) => c.raw_text === marker)).toEqual([]);
    });

    test(`${kind}: a submit answers, waits in the right place, and APPROVE files it`, async () => {
      const fx = FIXTURES[kind];
      const fields = fx.valid();
      const isTask = kind === "task" || kind === "ticket";
      const answer = await submitTyped(kind, fields);

      // -- the answer ------------------------------------------------------
      expect(Object.keys(answer).sort()).toEqual(["capture_id", "kind", "ok", "review", "routed_id", "routed_to", "ticket_key", "title", "typed"]);
      expect(answer).toMatchObject({ ok: true, typed: true, kind, title: fx.title(fields) });
      if (isTask) {
        expect(answer.review).toBe("tickets_inbox");
        expect(answer.routed_to).toBe("tickets");
        expect(answer.ticket_key).toMatch(/^[A-Z0-9]+-\d+$/);
        if (kind === "ticket") expect(answer.ticket_key!.startsWith(`${projectPrefix}-`), `${answer.ticket_key} carries the project's prefix`).toBe(true);
      } else {
        expect(answer.review).toBe("captures");
        expect(answer.routed_to).toBe("raw_captures");
        expect(answer.routed_id).toBe(answer.capture_id);
        expect(answer.ticket_key).toBeNull();
      }

      // -- where it waits --------------------------------------------------
      const waiting = (await queue()).find((c) => c.id === answer.capture_id);
      expect(waiting, "a typed capture is in the review queue from the moment it lands").toBeTruthy();
      expect(waiting!.raw_text).toBe(fx.text(fields));
      expect(waiting!).toMatchObject({ source: "web", llm_source: "regex", reviewed_at: null, discarded_at: null });
      expect(waiting!.classification).toMatchObject({ typed: true, typed_kind: kind, kind: kind === "ticket" ? "task" : kind, typed_fields: fields, mentions: [] });

      if (isTask) {
        // the ticket is in the Tickets Inbox with the form's values as suggestions
        const inbox = await json<{ tickets: Array<{ id: string; title: string; ticket_key: string; project_id: string | null; source: string; suggested: Record<string, unknown> | null; due_window: string | null; key: boolean }> }>(await api.get("/api/tickets?list=inbox&limit=500"));
        const ticket = inbox.tickets.find((t) => t.id === answer.routed_id);
        expect(ticket, "the ticket is in the Inbox").toBeTruthy();
        expect(ticket!).toMatchObject({ title: fields.title, ticket_key: answer.ticket_key, source: "ui" });
        expect(ticket!.suggested).toMatchObject({ typed: fields });
        if (kind === "task") {
          expect(ticket!.suggested).toMatchObject({ due_window: "week" });
          expect(ticket!).toMatchObject({ due_window: "week", key: true });
        } else {
          expect(ticket!.project_id).toBe(projectId);
          expect(ticket!.suggested).toMatchObject({ project_id: projectId });
        }
      } else {
        // nothing has been made yet: no row carries this capture's wording outside raw_captures
        expect(waiting!.routed_to).toBe("raw_captures");
      }

      // -- the learning row: chosen now, predicted by the shadow classifier a moment later
      const row = learning(answer.capture_id);
      expect(row).toMatchObject({ source: "web", chosen_kind: kind, chosen_fields: fields, approved_kind: null, text: fx.text(fields).slice(0, 400) });
      await expect.poll(() => learning(answer.capture_id)?.predicted_llm_source, { message: "the shadow classification lands", timeout: 20_000 }).toBe("regex");
      expect(typeof learning(answer.capture_id)!.predicted_kind).toBe("string");

      // -- APPROVE ---------------------------------------------------------
      const approved = await review(answer.capture_id, { action: "approve", kind: kind === "ticket" ? "task" : kind, fields });
      expect(approved.action).toBe("approve");
      expect(approved.capture.reviewed_at).not.toBeNull();
      expect(approved.capture.routed_to).toBe(fx.lands);
      if (isTask) {
        // already a ticket: approving the capture makes no second one
        expect(approved.capture.routed_id).toBe(answer.routed_id);
        expect(localSql(`select count(*) from public.tickets where title = '${s(fields.title)}'`)[0][0]).toBe("1");
      } else if (fx.lands === "raw_captures") {
        expect(approved.capture.routed_id).toBe(answer.capture_id);
      } else if (fx.lands === "daylog_days") {
        // a Journal capture is appended to today's Day log on the capture channel
        const today = await appToday(api);
        const d = (await readDay(api, today)).day;
        expect(approved.capture.routed_id).toBe(d.id);
        expect(d.transcript.filter((e) => e.text === fields.text)).toMatchObject([{ role: "user", channel: "capture" }]);
      } else {
        expect(approved.capture.routed_id).not.toBe(answer.capture_id);
        const got = localSql(fx.readBack!(approved.capture.routed_id))[0]?.[0] ?? "";
        if (kind === "reminder") expect(got).toBe(`${fields.message}|reminder|2031-01-15 09:30`);
        if (kind === "purchase") expect(got).toBe(`${fields.title}|4.5|GBP|need|this_week|shopping|home`);
        if (kind === "media") expect(got).toBe(`${fields.title}|read|A. Writer|backlog`);
        if (kind === "quote") expect(got).toBe(`${fields.text}|true|e2e`);
        if (kind === "account") expect(got).toBe(`${fields.name}|trial|9.99|monthly|GBP`);
        if (kind === "pain_log") expect(got).toBe(`${fields.notes}|4|mild|knee|standalone`);
        if (kind === "person") {
          expect(approved.capture.routed_id).toBe(personId);
          // notes accumulate as a dated line; the person is updated, never created
          expect(got.split("|")[0]).toBe("friend");
          expect(got.split("|")[1]).toMatch(new RegExp(`\\d{4}-\\d{2}-\\d{2}: ${fields.notes}$`));
        }
      }

      // -- out of the queue, kept in ALL, and the approval is learned -------
      // (a quote is the exception today: see FINDING capture-7 below)
      if (kind !== "quote") expect((await queue()).some((c) => c.id === answer.capture_id)).toBe(false);
      const kept = (await queue("all")).find((c) => c.id === answer.capture_id);
      expect(kept?.reviewed_at).not.toBeNull();
      const after = learning(answer.capture_id)!;
      expect(after.approved_kind).toBe(kind === "ticket" ? "task" : kind);
      expect(after.approved_fields).toEqual(fields);
      expect(after.approved_at).not.toBeNull();

      // approving twice makes nothing more
      const again = await review(answer.capture_id, { action: "approve", kind: kind === "ticket" ? "task" : kind, fields });
      expect(again.capture.routed_id).toBe(approved.capture.routed_id);
    });
  }

  test("an unknown type, an empty body and broken JSON are refused", async () => {
    const unknown = await api.post("/api/capture", { data: { typed: { kind: "banana", fields: { title: `${T} banana` } } } });
    expect(unknown.status()).toBe(400);
    expect(await json(unknown)).toEqual({ error: "unknown capture type" });
    const empty = await api.post("/api/capture", { data: {} });
    expect(empty.status()).toBe(400);
    expect(await json(empty)).toEqual({ error: "text required" });
    expect((await api.post("/api/capture", { data: { text: "   " } })).status()).toBe(400);
    const broken = await api.post("/api/capture", { headers: { "content-type": "application/json" }, data: "{" });
    expect(broken.status()).toBe(400);
  });

  test("a typed form never creates a person, whoever it names", async () => {
    const name = `Zebedee${T.replace(/[^a-z0-9]/gi, "")}`;
    const fields = { title: `${T} note ${name} said he would call Marguerite`, summary: "", tags: [] };
    const answer = await submitTyped("note", fields);
    await review(answer.capture_id, { action: "approve", kind: "note", fields });
    expect(localSql(`select count(*) from public.people where first_name ilike '${name}%' or display_name ilike '${name}%'`)[0][0]).toBe("0");
    // nor is anyone queued for review as a new person, nor recorded as a mention
    expect(localSql(`select count(*) from public.pending_entities where capture_id = '${answer.capture_id}'`)[0][0]).toBe("0");
    expect(localSql(`select count(*) from public.people_mentions where source_id = '${answer.capture_id}'`)[0][0]).toBe("0");
  });

  test("a ticket leaving the Inbox is learned as the approval", async () => {
    const fields = FIXTURES.task.valid();
    const answer = await submitTyped("task", fields);
    const moved = await api.post(`/api/tickets/${answer.ticket_key}/move`, { data: { category: "next" } });
    expect(moved.status(), await moved.text()).toBe(200);
    await expect.poll(() => learning(answer.capture_id)?.approved_at ?? null, { timeout: 15_000 }).not.toBeNull();
    expect(learning(answer.capture_id)!.approved_fields).toMatchObject({ title: fields.title, due_window: "week" });
  });

  test.fixme("FINDING capture-8: a plain task accepted from the Inbox is learned as a “ticket”", async () => {
    // lib/capture/learning.ts recordTicketApproval() says `t.project_id ? "ticket" : "task"`, but every ticket
    // is given the space's General project on insert, so the answer is always "ticket". It should say "ticket"
    // only when the project is a Tickets (technical) one.
    const answer = await submitTyped("task", FIXTURES.task.valid());
    await api.post(`/api/tickets/${answer.ticket_key}/move`, { data: { category: "next" } });
    await expect.poll(() => learning(answer.capture_id)?.approved_kind, { timeout: 15_000 }).toBe("task");
  });

  test.fixme("FINDING capture-7: an approved quote never leaves NEEDS REVIEW", async () => {
    // GET /api/captures/review?tab=needs_review ORs in `confidence in (low, ambiguous)` and `kind = ambiguous`
    // without `reviewed_at is null`, and every quote is stored with confidence "low" — so a quote that has been
    // approved (and is a quotes row) is back in the queue on the next load, and is counted by the pending count.
    const fields = FIXTURES.quote.valid();
    const answer = await submitTyped("quote", fields);
    await review(answer.capture_id, { action: "approve", kind: "quote", fields });
    expect((await queue()).some((c) => c.id === answer.capture_id)).toBe(false);
  });

  test.fixme("FINDING capture-1: a typed task is triaged twice — it sits in the Tickets Inbox and in Capture review", async () => {
    // Today GET /api/captures/review?tab=needs_review lists every typed capture that is not reviewed, including
    // the task/ticket ones that are already tickets in the Inbox; moving the ticket out of the Inbox does not
    // set reviewed_at, so the card stays in Capture review until it is approved there as well.
    const answer = await submitTyped("task", FIXTURES.task.valid());
    expect((await queue()).some((c) => c.id === answer.capture_id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

test.describe("The review queue", () => {
  test("what the queue holds: typed and low-confidence captures, not plain ones, not discarded ones", async () => {
    const typed = await submitTyped("idea", FIXTURES.idea.valid());
    const plain = await api.post("/api/capture", { data: { text: `${T} the spare key is under the blue pot` } });
    expect(plain.status()).toBe(200);
    const plainId = (await json<{ routed_id: string }>(plain)).routed_id;
    captures.push(plainId);
    const quote = await api.post("/api/capture", { data: { text: `quote: ${T} measure twice` } });
    expect(quote.status()).toBe(200);
    const quoteId = (await json<{ routed_id: string }>(quote)).routed_id;
    captures.push(quoteId);

    const needs = await queue();
    expect(needs.some((c) => c.id === typed.capture_id), "typed, not yet reviewed").toBe(true);
    expect(needs.find((c) => c.id === quoteId)?.classification, "a quote is always reviewed").toMatchObject({ kind: "quote", confidence: "low" });
    // a fresh, confidently filed capture is not in the queue (it joins it only when it has sat unreviewed for an hour)
    expect(needs.some((c) => c.id === plainId)).toBe(false);
    const all = await queue("all");
    for (const id of [typed.capture_id, plainId, quoteId]) expect(all.some((c) => c.id === id)).toBe(true);
    // newest first, with a cursor
    const ids = all.map((c) => c.id);
    expect(ids.indexOf(quoteId)).toBeLessThan(ids.indexOf(plainId));
    expect(ids.indexOf(plainId)).toBeLessThan(ids.indexOf(typed.capture_id));
    const page1 = await json<{ captures: Capture[]; next_cursor: string | null }>(await api.get("/api/captures/review?tab=all&limit=1"));
    expect(page1.captures).toHaveLength(1);
    expect(page1.next_cursor).toBe(page1.captures[0].created_at);
    const page2 = await json<{ captures: Capture[] }>(await api.get(`/api/captures/review?tab=all&limit=1&before=${encodeURIComponent(page1.next_cursor!)}`));
    expect(page2.captures[0].id).not.toBe(page1.captures[0].id);
    expect(Object.keys(all[0]).sort()).toEqual(["audio_url", "classification", "created_at", "discarded_at", "id", "llm_source", "raw_text", "reviewed_at", "routed_id", "routed_to", "source", "space_id"]);

    // discard: out of both tabs, and final
    const gone = await review(typed.capture_id, { action: "discard" });
    expect(gone.capture.discarded_at).not.toBeNull();
    expect((await queue()).some((c) => c.id === typed.capture_id)).toBe(false);
    expect((await queue("all")).some((c) => c.id === typed.capture_id)).toBe(false);
    const twice = await api.patch(`/api/captures/${typed.capture_id}/review`, { data: { action: "discard" } });
    expect(twice.status()).toBe(409);
    expect((await api.patch(`/api/captures/${typed.capture_id}/review`, { data: { action: "approve" } })).status()).toBe(409);
    // the list of all captures still shows a discarded one; a deleted one is gone from everything
    const list = async () => (await json<{ captures: Capture[] }>(await api.get("/api/captures?limit=200"))).captures;
    expect((await list()).some((c) => c.id === typed.capture_id)).toBe(true);
    expect((await api.delete(`/api/captures/${plainId}`)).status()).toBe(200);
    expect((await list()).some((c) => c.id === plainId)).toBe(false);
    expect((await queue("all")).some((c) => c.id === plainId)).toBe(false);
    expect((await api.delete(`/api/captures/${plainId}`)).status()).toBe(404);
  });

  test("bad review requests are refused", async () => {
    const answer = await submitTyped("note", FIXTURES.note.valid());
    expect((await api.patch(`/api/captures/${answer.capture_id}/review`, { data: { action: "explode" } })).status()).toBe(400);
    expect((await api.patch(`/api/captures/${answer.capture_id}/review`, { data: {} })).status()).toBe(400);
    expect((await api.patch("/api/captures/00000000-0000-4000-8000-000000000000/review", { data: { action: "approve" } })).status()).toBe(404);
    // an approve whose form does not validate changes nothing
    const bad = await api.patch(`/api/captures/${answer.capture_id}/review`, { data: { action: "approve", kind: "reminder", fields: { message: "no date" } } });
    expect(bad.status()).toBe(400);
    expect((await json<{ errors: Record<string, string> }>(bad)).errors).toEqual({ date: "Date", time: "Time" });
    const still = (await queue()).find((c) => c.id === answer.capture_id);
    expect(still?.reviewed_at).toBeNull();
    expect(still?.classification.kind).toBe("note");
    // a ticket re-route needs a Tickets project
    const noProject = await api.patch(`/api/captures/${answer.capture_id}/review`, { data: { action: "approve", kind: "ticket", fields: { title: "x" } } });
    expect(noProject.status()).toBe(400);
  });

  test("re-route: a typed purchase that was really a film becomes a media item, and that is learned", async () => {
    const answer = await submitTyped("purchase", { title: `${T} reroute the long film`, list_type: "wishlist", amount: "", currency: "", want_or_need: "", urgency: "someday", category: "" });
    const fields = { title: `${T} reroute the long film`, media_type: "watch", creator: "", media_status: "backlog", url: "", tags: [], notes: "" };
    const out = await review(answer.capture_id, { action: "reroute", kind: "media", fields });
    expect(out.action).toBe("reroute");
    expect(out.capture.routed_to).toBe("media_items");
    expect(out.capture.classification).toMatchObject({ kind: "media", typed: true, typed_kind: "media", typed_fields: fields, title: fields.title });
    expect(localSql(`select title || '|' || media_type from public.media_items where id = '${out.capture.routed_id}'`)[0][0]).toBe(`${fields.title}|watch`);
    expect(localSql(`select count(*) from public.purchases where title = '${fields.title}'`)[0][0]).toBe("0");
    expect(learning(answer.capture_id)).toMatchObject({ chosen_kind: "purchase", approved_kind: "media", approved_fields: fields });
    // a later approve does not make a second media item
    const approved = await review(answer.capture_id, { action: "approve", kind: "media", fields });
    expect(approved.capture.routed_id).toBe(out.capture.routed_id);
    expect(localSql(`select count(*) from public.media_items where title = '${fields.title}'`)[0][0]).toBe("1");
  });

  test.fixme("FINDING capture-2: the pending-review count leaves typed captures out", async () => {
    // lib/captures/reviewCount.ts lacks the `typed and not reviewed` clause that GET /api/captures/review has
    // (and the deleted_at filter), so the dashboard card and the briefing footer under-count the queue.
    const count = async () => (await json<{ count: number }>(await api.get("/api/captures/review/pending-count"))).count;
    const before = await count();
    await submitTyped("note", FIXTURES.note.valid());
    expect(await count()).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------

test.describe("One capture per client_uuid", () => {
  test("the same id twice is one row, typed or not", async () => {
    for (const body of [{ typed: { kind: "note", fields: { title: `${T} once only typed`, summary: "", tags: [] } } }, { text: `${T} once only auto note to remember` }]) {
      const client_uuid = crypto.randomUUID();
      const first = await api.post("/api/capture", { data: { ...body, client_uuid } });
      expect(first.status()).toBe(200);
      const id = (await json<{ capture_id?: string; routed_id: string }>(first)).capture_id ?? (await json<{ routed_id: string }>(first)).routed_id;
      captures.push(id);
      const second = await api.post("/api/capture", { data: { ...body, client_uuid } });
      expect(second.status()).toBe(200);
      expect(await json(second)).toEqual({ ok: true, deduplicated: true });
      // a different body under the same id is still the first capture
      const third = await api.post("/api/capture", { data: { text: `${T} a different thought`, client_uuid } });
      expect(await json(third)).toEqual({ ok: true, deduplicated: true });
      expect(localSql(`select count(*) from public.raw_captures where client_uuid = '${client_uuid}'`)[0][0]).toBe("1");
      expect(localSql(`select count(*) from public.capture_learning where capture_id = '${id}'`)[0][0]).toBe("1");
    }
  });

  test.fixme("FINDING capture-3: two submits of one client_uuid at the same moment — one of them answers 500", async () => {
    // The route reads for a duplicate, then inserts; both requests pass the read, the unique index
    // (raw_captures_client_uuid_key) refuses the second insert and the route answers 500 "capture failed".
    // One row is stored (good); the loser should be told `deduplicated`, as a retry is.
    const client_uuid = crypto.randomUUID();
    const body = { typed: { kind: "note", fields: { title: `${T} double tap`, summary: "", tags: [] } }, client_uuid };
    const both = await Promise.all([api.post("/api/capture", { data: body }), api.post("/api/capture", { data: body })]);
    for (const id of localSql(`select id from public.raw_captures where client_uuid = '${client_uuid}'`).map((r) => r[0])) captures.push(id);
    expect(both.map((r) => r.status())).toEqual([200, 200]);
    expect(localSql(`select count(*) from public.raw_captures where client_uuid = '${client_uuid}'`)[0][0]).toBe("1");
  });

  test("the race still stores exactly one row", async () => {
    const client_uuid = crypto.randomUUID();
    const body = { typed: { kind: "note", fields: { title: `${T} double tap stored once`, summary: "", tags: [] } }, client_uuid };
    await Promise.all([api.post("/api/capture", { data: body }), api.post("/api/capture", { data: body })]);
    const rows = localSql(`select id from public.raw_captures where client_uuid = '${client_uuid}'`).map((r) => r[0]);
    captures.push(...rows);
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

test.describe("Auto capture with cloud AI off", () => {
  /** What the regex fallback makes of a sentence today, and where the pipeline files it straight away. */
  const AUTO: Array<{ say: string; kind: string; routed_to: string; urgency?: string; inQueue: boolean }> = [
    { say: "the boiler pressure sits at one and a half bar", kind: "capture", routed_to: "raw_captures", inQueue: false },
    { say: "need to renew the passport this week", kind: "purchase", routed_to: "purchases", urgency: "this_week", inQueue: false },
    { say: "todo sweep the yard today", kind: "task", routed_to: "tickets", urgency: "today", inQueue: false },
    { say: "decided to keep the old van", kind: "decision", routed_to: "raw_captures", inQueue: false },
    { say: "what if the shed had a green roof", kind: "idea", routed_to: "raw_captures", inQueue: false },
    { say: "remember the gas meter is behind the hedge", kind: "note", routed_to: "raw_captures", inQueue: false },
    { say: "lovely walk this evening, grateful for the sunset", kind: "journal", routed_to: "daylog_days", inQueue: false },
    { say: "buy a new kettle", kind: "purchase", routed_to: "purchases", inQueue: false },
    { say: "bench 5x5 80kg", kind: "workout", routed_to: "raw_captures", inQueue: false },
    { say: "left knee hurts going downstairs", kind: "pain_log", routed_to: "exercise_pain_logs", inQueue: false },
    { say: "add to my watch list the long film", kind: "media", routed_to: "media_items", inQueue: false },
  ];

  for (const row of AUTO) {
    test(`"${row.say}" → ${row.kind}, filed in ${row.routed_to}`, async () => {
      const text = `${T} ${row.say}`;
      const res = await api.post("/api/capture", { data: { text } });
      expect(res.status(), (await res.text()).slice(0, 200)).toBe(200);
      const body = await json<{ ok: boolean; kind: string; urgency: string; title: string; llm_source: string; routed_to: string; routed_id: string }>(res);
      const captureId = localSql(`select id from public.raw_captures where raw_text = '${text.replace(/'/g, "''")}' order by created_at desc limit 1`)[0][0];
      captures.push(captureId);
      if (body.routed_to !== "raw_captures") made.push({ table: body.routed_to, id: body.routed_id });

      expect(Object.keys(body).sort()).toEqual(["kind", "llm_source", "ok", "routed_id", "routed_to", "title", "urgency"]);
      // no model answered, so the regex fallback classified it — and the capture still went through
      expect(body).toMatchObject({ ok: true, llm_source: "regex", kind: row.kind, routed_to: row.routed_to, urgency: row.urgency ?? "someday" });
      expect(body.title).toBe(text.split(/\s+/).slice(0, 7).join(" ").slice(0, 80));
      if (row.routed_to === "raw_captures") expect(body.routed_id).toBe(captureId);

      expect((await queue()).some((c) => c.id === captureId)).toBe(row.inQueue);
      const stored = (await queue("all")).find((c) => c.id === captureId)!;
      expect(stored).toMatchObject({ source: "web", llm_source: "regex", raw_text: text, routed_to: row.routed_to, reviewed_at: null });
      expect(stored.classification.typed).toBeUndefined();
      // the learning row records the prediction; nobody chose anything
      expect(learning(captureId)).toMatchObject({ predicted_kind: row.kind, predicted_llm_source: "regex", chosen_kind: null, approved_kind: null, source: "web" });

      if (row.routed_to === "tickets") {
        const t = localSql(`select title || '|' || source || '|' || (suggested is not null) from public.tickets where id = '${body.routed_id}'`)[0][0];
        expect(t).toBe(`${body.title}|ui|true`);
      }
      if (row.routed_to === "daylog_days") {
        const d = (await readDay(api, await appToday(api))).day;
        expect(body.routed_id).toBe(d.id);
        expect(d.transcript.filter((e) => e.text === text)).toMatchObject([{ role: "user", channel: "capture" }]);
      }
    });
  }

  test("a quote is held for review and nothing is filed until it is approved", async () => {
    const text = `quote: ${T} never trust a quiet server`;
    const res = await api.post("/api/capture", { data: { text } });
    expect(res.status()).toBe(200);
    const body = await json<{ kind: string; routed_to: string; routed_id: string; llm_source: string }>(res);
    captures.push(body.routed_id);
    expect(body).toMatchObject({ kind: "quote", routed_to: "raw_captures", llm_source: "regex" });
    const waiting = (await queue()).find((c) => c.id === body.routed_id)!;
    expect(waiting.classification).toMatchObject({ kind: "quote", confidence: "low", quote: { text: `${T} never trust a quiet server`, is_own: true } });
    expect(localSql(`select count(*) from public.quotes where text = '${T} never trust a quiet server'`)[0][0]).toBe("0");
    const approved = await review(body.routed_id, { action: "approve", kind: "quote" });
    expect(approved.capture.routed_to).toBe("quotes");
    expect(localSql(`select text from public.quotes where id = '${approved.capture.routed_id}'`)[0][0]).toBe(`${T} never trust a quiet server`);
  });

  test.fixme("FINDING capture-4: “remind me to …” typed into Auto capture never becomes a reminder", async () => {
    // The classifier says kind = reminder, but lib/router/writeCapture.ts has no reminder branch (only the
    // Telegram webhook makes one), so the capture stays in raw_captures with nothing to fire, and it is not
    // in the review queue either until it has sat for an hour. It should become a reminder, or wait in review.
    const text = `${T} remind me to call the dentist at 9am tomorrow`;
    const res = await api.post("/api/capture", { data: { text } });
    expect(res.status()).toBe(200);
    const body = await json<{ kind: string; routed_to: string; routed_id: string }>(res);
    captures.push(localSql(`select id from public.raw_captures where raw_text = '${text}'`)[0][0]);
    if (body.routed_to === "tickets") made.push({ table: "tickets", id: body.routed_id });
    expect(body.kind).toBe("reminder");
    const filed = body.routed_to === "tickets";
    const waiting = (await queue()).some((c) => c.raw_text === text);
    expect(filed || waiting, "a reminder is either set or waiting for review").toBe(true);
  });

  test("the capture route is for people: the cron bearer and no credentials are refused", async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, storageState: NO_SESSION });
    expect((await anon.post("/api/capture", { data: { text: `${T} anonymous` } })).status()).toBe(401);
    expect((await anon.post("/api/capture", { data: { text: `${T} cron` }, headers: { Authorization: "Bearer e2e-cron-secret" } })).status()).toBe(401);
    expect((await anon.get("/api/captures/review")).status()).toBe(401);
    await anon.dispose();
    expect(localSql(`select count(*) from public.raw_captures where raw_text in ('${T} anonymous', '${T} cron')`)[0][0]).toBe("0");
  });
});

// ---------------------------------------------------------------------------

test.describe("In the browser", () => {
  const openCapture = async (page: Page) => {
    await page.goto("/organisation/captures/review");
    await page.getByLabel("Primary navigation").getByRole("button", { name: "Capture" }).click();
    const dialog = page.getByRole("dialog", { name: "Capture" });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  const card = (page: Page, text: string) => page.getByRole("article").filter({ hasText: text });
  const captured = (page: Page) => page.waitForResponse((r) => new URL(r.url()).pathname === "/api/capture" && r.request().method() === "POST");
  const reviewed = (page: Page) => page.waitForResponse((r) => /\/api\/captures\/.+\/review$/.test(new URL(r.url()).pathname) && r.request().method() === "PATCH");
  const idOf = (text: string) => localSql(`select id from public.raw_captures where raw_text = '${text}' order by created_at desc limit 1`)[0]?.[0];

  test("the form offers Auto and every registry type, and carries the text across a change of type", async ({ page }) => {
    const dialog = await openCapture(page);
    const type = dialog.getByLabel("Capture type");
    await expect(type).toHaveValue("auto");
    expect(await type.locator("option").allTextContents()).toEqual(["Auto", ...TYPED_KINDS.map((k) => ENTITY_REGISTRY[k].label)]);
    const submit = dialog.getByRole("button", { name: /^Capture/ }).last();
    await expect(submit).toBeDisabled();

    await dialog.getByPlaceholder("Capture a thought, task, or decision…").fill(`${T} carried across`);
    await type.selectOption("note");
    await expect(dialog.locator("#ef-note-title")).toHaveValue(`${T} carried across`);
    await expect(dialog.getByText("Goes to Capture review for a one-tap approve.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Capture Note →" })).toBeEnabled();
    await type.selectOption("task");
    await expect(dialog.locator("#ef-task-title")).toHaveValue(`${T} carried across`);
    await expect(dialog.getByText("Goes to the Tickets Inbox.")).toBeVisible();
    await type.selectOption("auto");
    await expect(dialog.getByPlaceholder("Capture a thought, task, or decision…")).toHaveValue(`${T} carried across`);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("a form that does not validate shows the message on the field and sends nothing", async ({ page }) => {
    const dialog = await openCapture(page);
    let sent = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/capture") sent++;
    });
    await dialog.getByLabel("Capture type").selectOption("reminder");
    await dialog.locator("#ef-reminder-message").fill(`${T} reminder with no time`);
    await dialog.getByRole("button", { name: "Capture Reminder →" }).click();
    await expect(dialog.locator("#ef-reminder-date")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.locator("#ef-reminder-time")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText("Date", { exact: true }).last()).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(sent).toBe(0);
  });

  test("a typed note: captured, shown in review with its form filled in, approved in one tap", async ({ page }) => {
    const seen = watch(page);
    const text = `${T} browser note the stopcock is under the sink`;
    const dialog = await openCapture(page);
    await dialog.getByLabel("Capture type").selectOption("note");
    await dialog.locator("#ef-note-title").fill(text);
    await dialog.locator("#ef-note-summary").fill("left of the U-bend");
    const posted = captured(page);
    await dialog.getByRole("button", { name: "Capture Note →" }).click();
    const res = await posted;
    expect(res.status()).toBe(200);
    const answer = (await res.json()) as TypedAnswer;
    captures.push(answer.capture_id);
    await expect(page.getByRole("status")).toHaveText("✓ Captured → Review");
    await expect(dialog).toHaveCount(0);

    await page.goto("/organisation/captures/review");
    await expect(page.getByRole("tab", { name: "NEEDS REVIEW" })).toHaveAttribute("aria-selected", "true");
    const c = card(page, text);
    await expect(c).toBeVisible();
    await expect(c).toContainText("· web");
    await expect(c).toContainText("waiting for approve");
    await expect(c.getByLabel("Kind")).toHaveValue("note");
    await expect(c.locator("#ef-note-title")).toHaveValue(text);
    await expect(c.locator("#ef-note-summary")).toHaveValue("left of the U-bend");

    const done = reviewed(page);
    await c.getByRole("button", { name: "APPROVE" }).click();
    expect((await done).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("APPROVE");
    await expect(card(page, text)).toHaveCount(0);

    await page.getByRole("tab", { name: "ALL", exact: true }).click();
    await expect(card(page, text)).toContainText("REVIEWED");
    expect(learning(answer.capture_id)).toMatchObject({ chosen_kind: "note", approved_kind: "note" });

    // the captures list shows it under its kind
    await page.goto("/organisation/captures");
    await expect(page.getByRole("listitem").filter({ hasText: text })).toContainText("NOTE");
    await page.getByRole("button", { name: "IDEA", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: text })).toHaveCount(0);
    await page.getByRole("button", { name: "NOTE", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible();
    expect(seen.serverErrors).toEqual([]);
    expect(seen.crashes).toEqual([]);
  });

  test("a typed task goes to the Inbox and says so with its key", async ({ page }) => {
    const text = `${T} browser task oil the hinges`;
    const dialog = await openCapture(page);
    await dialog.getByLabel("Capture type").selectOption("task");
    await dialog.locator("#ef-task-title").fill(text);
    const posted = captured(page);
    await dialog.locator("#ef-task-title").press("Control+Enter");
    const res = await posted;
    expect(res.status()).toBe(200);
    const answer = (await res.json()) as TypedAnswer;
    captures.push(answer.capture_id);
    made.push({ table: "tickets", id: answer.routed_id });
    expect(answer.review).toBe("tickets_inbox");
    await expect(page.getByRole("status")).toHaveText(`✓ Captured → Inbox · ${answer.ticket_key}`);
    const ticket = await api.get(`/api/tickets/${answer.ticket_key}`);
    expect(ticket.status()).toBe(200);
    expect(JSON.stringify(await ticket.json())).toContain(text);
  });

  test("re-route in review: a note that was really an idea", async ({ page }) => {
    const text = `${T} browser reroute a bench by the pond`;
    const answer = await submitTyped("note", { title: text, summary: "", tags: [] });
    await page.goto("/organisation/captures/review");
    const c = card(page, text);
    await c.getByLabel("Kind").selectOption("idea");
    await expect(c.locator("#ef-idea-title")).toHaveValue(text);
    const done = reviewed(page);
    await c.getByRole("button", { name: "RE-ROUTE" }).click();
    expect((await done).status()).toBe(200);
    await expect(card(page, text)).toHaveCount(0);
    const stored = (await queue("all")).find((x) => x.id === answer.capture_id)!;
    expect(stored.classification).toMatchObject({ kind: "idea", typed_kind: "idea" });
    expect(stored.reviewed_at).not.toBeNull();
    expect(learning(answer.capture_id)).toMatchObject({ chosen_kind: "note", approved_kind: "idea" });
  });

  test("approve in review refuses a form that does not validate, and says why on the field", async ({ page }) => {
    const text = `${T} browser invalid approve`;
    const answer = await submitTyped("note", { title: text, summary: "", tags: [] });
    await page.goto("/organisation/captures/review");
    const c = card(page, text);
    await c.getByLabel("Kind").selectOption("reminder");
    let sent = 0;
    page.on("request", (r) => {
      if (r.method() === "PATCH" && r.url().includes("/review")) sent++;
    });
    await c.getByRole("button", { name: "APPROVE" }).click();
    await expect(c.locator("#ef-reminder-date")).toHaveAttribute("aria-invalid", "true");
    expect(sent).toBe(0);
    expect((await queue()).find((x) => x.id === answer.capture_id)?.reviewed_at).toBeNull();
  });

  test("discard in review: the card goes and the capture is out of both tabs", async ({ page }) => {
    const text = `${T} browser discard this one`;
    const answer = await submitTyped("decision", { title: text, summary: "", tags: [] });
    await page.goto("/organisation/captures/review");
    const done = reviewed(page);
    await card(page, text).getByRole("button", { name: "DISCARD" }).click();
    expect((await done).status()).toBe(200);
    await expect(card(page, text)).toHaveCount(0);
    await page.getByRole("tab", { name: "ALL", exact: true }).click();
    await expect(page.getByRole("tab", { name: "ALL", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/\d+ SHOWN/)).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(card(page, text)).toHaveCount(0);
    expect(localSql(`select discarded_at is not null from public.raw_captures where id = '${answer.capture_id}'`)[0][0]).toBe("t");
    expect(idOf(text)).toBe(answer.capture_id);
  });

  test("Auto in the browser with AI off: captured, no error, no destination promised", async ({ page }) => {
    const seen = watch(page);
    const text = `${T} browser auto the loft hatch key is in the red tin`;
    const dialog = await openCapture(page);
    await dialog.getByPlaceholder("Capture a thought, task, or decision…").fill(text);
    const posted = captured(page);
    await dialog.getByRole("button", { name: "Capture →" }).click();
    const res = await posted;
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { llm_source: string }).llm_source).toBe("regex");
    captures.push(idOf(text));
    await expect(page.getByRole("status")).toHaveText("✓ Captured");
    expect(seen.serverErrors).toEqual([]);
  });

  test.fixme("FINDING capture-9: a successful capture can throw in the page (the background ripple)", async ({ page }) => {
    // components/art/MyceliumField.tsx draw(): a ripple pushed by triggerFieldPulse() carries
    // startedAt = performance.now(), which can be later than the frame time requestAnimationFrame hands to
    // draw(); t is then negative, and ctx.arc(x, y, t * 260, …) throws "The radius provided is negative".
    // Seen on the compiled build after a capture from the modal. Guard with `if (t < 0 || t > 1) continue`.
    const seen = watch(page);
    const dialog = await openCapture(page);
    await dialog.getByPlaceholder("Capture a thought, task, or decision…").fill(`${T} browser ripple`);
    const posted = captured(page);
    await dialog.getByRole("button", { name: "Capture →" }).click();
    await posted;
    captures.push(idOf(`${T} browser ripple`));
    await expect(page.getByRole("status")).toHaveText("✓ Captured");
    expect(seen.ambient).toEqual([]);
  });

  test.fixme("FINDING capture-5: the captures list and the review card link nowhere for most destinations", async ({ page }) => {
    // components/compost/CapturesClient.tsx routedToLink() switches on "tasks" and "journal_entries", and
    // CaptureReviewClient.tsx routedUrl() on "media" / "task" / "journal" / "purchase" / "reminder" — but
    // routed_to holds table names (tickets, media_items, purchases, quotes, accounts), so a capture that
    // became a ticket shows no link to it.
    const answer = await submitTyped("task", { title: `${T} browser link to the ticket`, description: "", due_window: "", key: false, tags: [] });
    await page.goto(`/organisation/captures?focus=${answer.capture_id}`);
    await expect(page.locator(`#capture-${answer.capture_id}`).getByRole("link")).toHaveAttribute("href", new RegExp(`/work/browse/`));
  });
});
