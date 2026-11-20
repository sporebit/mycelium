/**
 * Capture as Phil, on the pipeline rebuilt on 2026-11-20 (lib/capture/pipeline.ts):
 *
 *   - Typed capture (MYC-161): every entity in the form registry — what it
 *     refuses, what a submit answers, where it waits, what APPROVE makes of it.
 *   - Auto capture: stored and answered "saved" at once, worked out
 *     afterwards. With cloud AI off the pattern rules decide what it is.
 *   - The review queue: every processed capture not yet answered; a task's
 *     card and its ticket are one decision.
 *   - One capture per client_uuid, however it is sent.
 *   - Long captures split into held items; paragraphs; a weight said aloud.
 *   - Audio: stored, queued for the PC, the transcript applied (this spec
 *     plays the PC's part) and never over a hand edit.
 *   - Nothing lost (the sweep) and nothing waiting for ever (the seven-day rule).
 *   - Capture learning (0138): predicted, chosen, approved.
 *
 * A check marked fixme is something the pipeline gets wrong today; it names
 * its finding and holds the behaviour it should have.
 */
import { test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { expect } from "./daylog.helpers.ts";
import { localSql } from "../lib/access/introspect.ts";
import { ENTITY_REGISTRY, TYPED_KINDS, type TypedKind } from "../lib/capture/registry.ts";
import { PHIL, personalSpace } from "./support/users.ts";
import { CRON_AUTH, NO_SESSION, appToday, json, londonNow, readDay, shift, tag, watch } from "./daylog.helpers.ts";
import { VOICE_NOTE, autoCapture, childrenOf, claimTranscription, finishTranscription, flat, jobsFor, processed, row, sendAudio, ticket, tidyCaptures, type Row } from "./capture.helpers.ts";

const T = tag("capture");

type Fields = Record<string, unknown>;
type TypedAnswer = { ok: boolean; status: string; typed: boolean; kind: string; title: string; routed_to: string; routed_id: string; ticket_key: string | null; review: "tickets_inbox" | "captures"; capture_id: string };
type Capture = { id: string; source: string; raw_text: string; classification: Record<string, unknown>; llm_source: string; routed_to: string; routed_id: string; reviewed_at: string | null; discarded_at: string | null; created_at: string; status: string; parent_capture_id: string | null };
type Reviewed = { ok: boolean; action: string; capture: { id: string; classification: Record<string, unknown>; routed_to: string; routed_id: string; reviewed_at: string | null; discarded_at: string | null } };

let api: APIRequestContext;
/** Captures this spec made; each is removed afterwards with its split-out items and whatever it became. */
const captures: string[] = [];
let projectId = "";
let projectPrefix = "";
let personId = "";
let todayExisted = true;

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
  await tidyCaptures(api, captures.splice(0));
});

test.afterAll(async ({ playwright }, info) => {
  const teardown = await playwright.request.newContext({ baseURL: info.project.use.baseURL, storageState: info.project.use.storageState as string });
  if (projectId) await teardown.delete(`/api/projects/${projectId}?hard=true`);
  if (personId) await teardown.delete(`/api/people/${personId}?hard=1`);
  // the gift the typed form made (owner-only rows, no hard-delete route of their own)
  localSql(`delete from public.gifts where title like '${T}%'`);
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
  gift_idea: {
    valid: () => ({ title: `${T} gift a decent chef knife`, for_person_id: "", for_label: "Jake", reason: "he cooks", url: "", target_price: "45", needed_by: "" }),
    invalid: { title: "", target_price: "lots" },
    errors: { title: "The gift is required", target_price: "Number" },
    text: (f) => s(f.title),
    title: (f) => s(f.title),
    lands: "gifts",
    readBack: (id) => `select title || '|' || coalesce(for_label, '') || '|' || status from public.gifts where id = '${id}'`,
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
  return body;
}

/** An Auto capture, followed to the end of the pipeline; remembered for tidy-up. */
async function auto(text: string, extra: Record<string, unknown> = {}): Promise<Row> {
  const saved = await autoCapture(api, text, extra);
  captures.push(saved.capture_id);
  return processed(saved.capture_id);
}

async function queue(tab: "needs_review" | "all" = "needs_review"): Promise<Capture[]> {
  const res = await api.get(`/api/captures/review?tab=${tab}&limit=200`);
  expect(res.status()).toBe(200);
  return (await json<{ captures: Capture[] }>(res)).captures;
}

async function review(id: string, body: Record<string, unknown>): Promise<Reviewed> {
  const res = await api.patch(`/api/captures/${id}/review`, { data: body });
  expect(res.status(), `review ${JSON.stringify(body).slice(0, 80)} → ${(await res.text()).slice(0, 200)}`).toBe(200);
  return json<Reviewed>(res);
}

type Learning = { predicted_kind: string | null; predicted_llm_source: string | null; chosen_kind: string | null; chosen_fields: Fields | null; approved_kind: string | null; approved_fields: Fields | null; approved_at: string | null; source: string; text: string };
function learning(captureId: string): Learning | null {
  const row = localSql(`select row_to_json(l) from public.capture_learning l where capture_id = '${captureId}'`)[0];
  return row ? (JSON.parse(row[0]) as Learning) : null;
}

const inQueue = async (id: string) => (await queue()).some((c) => c.id === id);
const cronApi = (playwright: PlaywrightWorkerArgs["playwright"]) =>
  playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: CRON_AUTH, storageState: NO_SESSION });

// ---------------------------------------------------------------------------

test.describe("Typed capture · every entity in the registry", () => {
  test("the fixtures cover the registry, in the order the form offers it", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...TYPED_KINDS].sort());
    expect(Object.keys(ENTITY_REGISTRY).sort()).toEqual([...TYPED_KINDS].sort());
    expect([...TYPED_KINDS]).toEqual(["task", "ticket", "reminder", "purchase", "media", "quote", "gift_idea", "journal", "idea", "decision", "note", "person", "account", "pain_log", "workout"]);
  });

  for (const kind of TYPED_KINDS) {
    test(`${kind}: refused with a message per field, and nothing is stored`, async () => {
      const fx = FIXTURES[kind];
      const res = await api.post("/api/capture", { data: { typed: { kind, fields: fx.invalid } } });
      expect(res.status()).toBe(400);
      // every reply says in its body whether it worked
      expect(await json(res)).toEqual({ ok: false, status: "error", error: Object.values(fx.errors)[0], errors: fx.errors });
      const marker = Object.values(fx.invalid).find((v) => typeof v === "string" && v.startsWith(T));
      if (marker) expect((await queue("all")).filter((c) => c.raw_text === marker)).toEqual([]);
    });

    test(`${kind}: a submit answers, waits in the right place, and APPROVE files it`, async () => {
      const fx = FIXTURES[kind];
      const fields = fx.valid();
      const isTask = kind === "task" || kind === "ticket";
      const answer = await submitTyped(kind, fields);

      // -- the answer ------------------------------------------------------
      expect(Object.keys(answer).sort()).toEqual(["capture_id", "kind", "ok", "review", "routed_id", "routed_to", "status", "ticket_key", "title", "typed"]);
      expect(answer).toMatchObject({ ok: true, status: "saved", typed: true, kind, title: fx.title(fields) });
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
      expect(waiting!).toMatchObject({ source: "web", llm_source: "regex", status: "processed", reviewed_at: null, discarded_at: null, parent_capture_id: null });
      expect(waiting!.classification).toMatchObject({ typed: true, typed_kind: kind, kind: kind === "ticket" ? "task" : kind, typed_fields: fields, mentions: [] });

      let suggested: Record<string, unknown> = {};
      if (isTask) {
        // the ticket is in the Tickets Inbox with the form's values as suggestions
        const inbox = await json<{ tickets: Array<{ id: string; title: string; ticket_key: string; project_id: string | null; source: string; suggested: Record<string, unknown> | null; due_window: string | null; key: boolean }> }>(await api.get("/api/tickets?list=inbox&limit=500"));
        const t = inbox.tickets.find((x) => x.id === answer.routed_id);
        expect(t, "the ticket is in the Inbox").toBeTruthy();
        expect(t!).toMatchObject({ title: fields.title, ticket_key: answer.ticket_key, source: "ui" });
        expect(t!.suggested).toMatchObject({ typed: fields });
        suggested = t!.suggested ?? {};
        if (kind === "task") {
          expect(t!.suggested).toMatchObject({ due_window: "week" });
          expect(t!).toMatchObject({ due_window: "week", key: true });
        } else {
          expect(t!.project_id).toBe(projectId);
          expect(t!.suggested).toMatchObject({ project_id: projectId });
        }
      } else {
        // nothing has been made yet
        expect(waiting!.routed_to).toBe("raw_captures");
      }

      // -- the learning row: what was chosen ---------------------------------
      expect(learning(answer.capture_id)).toMatchObject({ source: "web", chosen_kind: kind, chosen_fields: fields, approved_kind: null, text: fx.text(fields).slice(0, 400) });

      // -- APPROVE ---------------------------------------------------------
      const approved = await review(answer.capture_id, { action: "approve", kind: kind === "ticket" ? "task" : kind, fields });
      expect(approved.action).toBe("approve");
      expect(approved.capture.reviewed_at).not.toBeNull();
      expect(approved.capture.routed_to).toBe(fx.lands);
      if (isTask) {
        // already a ticket: approving the card makes no second one, and takes this one out of the Inbox
        expect(approved.capture.routed_id).toBe(answer.routed_id);
        expect(localSql(`select count(*) from public.tickets where title = '${s(fields.title)}'`)[0][0]).toBe("1");
        const t = ticket(answer.routed_id)!;
        expect(t.category).toBe("next");
        // the guesses kept for the Clarify card are applied on the way out
        if (Array.isArray(suggested.tools)) expect(t.tools).toEqual(suggested.tools);
        if (typeof suggested.points === "number") expect(t.points).toBe(suggested.points);
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
        if (kind === "reminder") {
          expect(got).toBe(`${fields.message}|reminder|2031-01-15 09:30`);
          expect(ticket(approved.capture.routed_id)!.category).toBe("next");
        }
        if (kind === "purchase") expect(got).toBe(`${fields.title}|4.5|GBP|need|this_week|shopping|home`);
        if (kind === "media") expect(got).toBe(`${fields.title}|read|A. Writer|backlog`);
        if (kind === "quote") expect(got).toBe(`${fields.text}|true|e2e`);
        if (kind === "gift_idea") expect(got).toBe(`${fields.title}|Jake|idea`);
        if (kind === "account") expect(got).toBe(`${fields.name}|trial|9.99|monthly|GBP`);
        if (kind === "pain_log") expect(got).toBe(`${fields.notes}|4|mild|knee|standalone`);
        if (kind === "person") {
          expect(approved.capture.routed_id).toBe(personId);
          // notes accumulate as a dated line; the person is updated, never created
          expect(got.split("|")[0]).toBe("friend");
          expect(got.split("|")[1]).toMatch(new RegExp(`\\d{4}-\\d{2}-\\d{2}: ${fields.notes}$`));
        }
      }

      // -- out of the queue (a quote too), kept in ALL, and the approval is learned
      expect(await inQueue(answer.capture_id)).toBe(false);
      const kept = (await queue("all")).find((c) => c.id === answer.capture_id);
      expect(kept?.reviewed_at).not.toBeNull();
      const after = learning(answer.capture_id)!;
      expect(after.approved_kind).toBe(kind === "ticket" ? "task" : kind);
      expect(after.approved_fields).toEqual(fields);
      expect(after.approved_at).not.toBeNull();
      // With a model, a shadow classification fills in what it would have guessed. With none (this server)
      // there is no prediction at all — before the rebuild the pattern rules' guess was recorded here.
      expect(after.predicted_kind).toBeNull();
      expect(after.predicted_llm_source).toBeNull();

      // approving twice makes nothing more
      const again = await review(answer.capture_id, { action: "approve", kind: kind === "ticket" ? "task" : kind, fields });
      expect(again.capture.routed_id).toBe(approved.capture.routed_id);
    });
  }

  test("an unknown type, an empty body and broken JSON are refused, each saying so in the body", async () => {
    const unknown = await api.post("/api/capture", { data: { typed: { kind: "banana", fields: { title: `${T} banana` } } } });
    expect(unknown.status()).toBe(400);
    expect(await json(unknown)).toEqual({ ok: false, status: "error", error: "unknown capture type" });
    const empty = await api.post("/api/capture", { data: {} });
    expect(empty.status()).toBe(400);
    expect(await json(empty)).toEqual({ ok: false, status: "error", error: "text required" });
    const blank = await api.post("/api/capture", { data: { text: "   " } });
    expect(blank.status()).toBe(400);
    expect(await json(blank)).toEqual({ ok: false, status: "error", error: "text required" });
    const broken = await api.post("/api/capture", { headers: { "content-type": "application/json" }, data: Buffer.from("{") });
    expect(broken.status()).toBe(400);
    expect(await json(broken)).toEqual({ ok: false, status: "error", error: "bad json" });
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

  test("a ticket leaving the Inbox is learned as what it is: a task, or a ticket when its project is a technical one", async () => {
    const task = FIXTURES.task.valid();
    const a = await submitTyped("task", task);
    expect((await api.post(`/api/tickets/${a.ticket_key}/move`, { data: { category: "next" } })).status()).toBe(200);
    await expect.poll(() => learning(a.capture_id)?.approved_kind, { timeout: 15_000 }).toBe("task");
    expect(learning(a.capture_id)!.approved_fields).toMatchObject({ title: task.title, due_window: "week" });

    const tk = FIXTURES.ticket.valid();
    const b = await submitTyped("ticket", tk);
    expect((await api.post(`/api/tickets/${b.ticket_key}/move`, { data: { category: "next" } })).status()).toBe(200);
    await expect.poll(() => learning(b.capture_id)?.approved_kind, { timeout: 15_000 }).toBe("ticket");
    expect(learning(b.capture_id)!.approved_fields).toMatchObject({ title: tk.title, project_id: projectId });
  });

  test("a captured task is one decision: accepting its card takes the ticket out of the Inbox, and moving the ticket answers the card", async () => {
    // -- the card first ----------------------------------------------------
    const fields = FIXTURES.task.valid();
    const typed = await submitTyped("task", fields);
    expect(await inQueue(typed.capture_id), "the card waits").toBe(true);
    expect(ticket(typed.routed_id)!.category, "and so does the ticket").toBe("inbox");
    await review(typed.capture_id, { action: "approve", kind: "task", fields });
    expect(ticket(typed.routed_id)!.category).toBe("next");
    expect(await inQueue(typed.capture_id)).toBe(false);

    // the same for a task nobody typed a form for
    const spoken = await auto(`${T} todo sweep the yard today`);
    expect(spoken.routed_to).toBe("tickets");
    expect(ticket(spoken.routed_id!)!.category).toBe("inbox");
    expect(await inQueue(spoken.id)).toBe(true);
    await review(spoken.id, { action: "approve" });
    expect(ticket(spoken.routed_id!)!.category).toBe("next");
    expect(await inQueue(spoken.id)).toBe(false);

    // -- the ticket first --------------------------------------------------
    const other = await auto(`${T} todo oil the gate hinges`);
    expect(await inQueue(other.id)).toBe(true);
    expect((await api.post(`/api/tickets/${other.routed_id}/move`, { data: { category: "next" } })).status()).toBe(200);
    await expect.poll(() => row(other.id)?.reviewed_at ?? null, { timeout: 15_000 }).not.toBeNull();
    expect(await inQueue(other.id)).toBe(false);
    // a ticket that has already left the Inbox is left exactly where it is when its card is accepted late
    const late = await auto(`${T} todo paint the fence`);
    expect((await api.post(`/api/tickets/${late.routed_id}/move`, { data: { category: "backlog" } })).status()).toBe(200);
    await expect.poll(() => row(late.id)?.reviewed_at ?? null, { timeout: 15_000 }).not.toBeNull();
    await review(late.id, { action: "approve" });
    expect(ticket(late.routed_id!)!.category).toBe("backlog");
  });

  test("whichever door the ticket leaves the Inbox by, its card is answered", async () => {
    // was FINDING capture-10: only the move route stamped the capture. Since 0163 a trigger on tickets does it,
    // so a PATCH with a category, a bulk move and a cancel are covered as well.
    const patched = await auto(`${T} todo clear the gutters`);
    expect((await api.patch(`/api/tickets/${patched.routed_id}`, { data: { category: "next" } })).status()).toBe(200);
    const cancelled = await auto(`${T} todo wash the van`);
    expect((await api.delete(`/api/tickets/${cancelled.routed_id}`)).status()).toBe(200);
    const bulk = await auto(`${T} todo sharpen the shears`);
    const bulkKey = localSql(`select ticket_key from public.tickets where id = '${bulk.routed_id}'`)[0][0];
    expect((await api.post("/api/tickets/bulk", { data: { keys: [bulkKey], set: { category: "next" } } })).status()).toBe(200);
    for (const c of [patched, cancelled, bulk]) {
      await expect.poll(() => row(c.id)?.reviewed_at ?? null, { message: c.raw_text ?? "", timeout: 10_000 }).not.toBeNull();
      expect(await inQueue(c.id)).toBe(false);
    }
    // a ticket still in the Inbox leaves its card alone
    const waiting = await auto(`${T} todo still in the inbox`);
    expect((await api.patch(`/api/tickets/${waiting.routed_id}`, { data: { title: `${T} todo still in the inbox, retitled` } })).status()).toBe(200);
    expect(row(waiting.id)!.reviewed_at).toBeNull();
    expect(await inQueue(waiting.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

test.describe("The review queue", () => {
  test("what the queue holds: every processed capture not yet answered, and nothing else", async () => {
    const typed = await submitTyped("idea", FIXTURES.idea.valid());
    const plain = await auto(`${T} the spare key is under the blue pot`);
    const quote = await auto(`quote: ${T} measure twice`);

    const needs = await queue();
    expect(needs.some((c) => c.id === typed.capture_id), "typed, not yet reviewed").toBe(true);
    // a plain capture is in the queue as soon as it is processed: no hour's wait, no confidence test
    expect(needs.find((c) => c.id === plain.id)).toMatchObject({ status: "processed", reviewed_at: null, routed_to: "raw_captures" });
    expect(needs.find((c) => c.id === quote.id)?.classification).toMatchObject({ kind: "quote", confidence: "low" });
    expect(Object.keys(needs[0]).sort()).toEqual(
      ["audio_path", "audio_url", "classification", "created_at", "discarded_at", "id", "llm_source", "parent_capture_id", "raw_text", "reviewed_at", "routed_id", "routed_to", "segment_index", "source", "space_id", "status", "text_edited", "text_source"].sort(),
    );

    // newest first unless asked for oldest first (the evening deck's order)
    const mine = (list: Capture[]) => list.map((c) => c.id).filter((id) => [typed.capture_id, plain.id, quote.id].includes(id));
    expect(mine(needs)).toEqual([quote.id, plain.id, typed.capture_id]);
    const typedAt = needs.find((c) => c.id === typed.capture_id)!.created_at;
    const justBefore = new Date(Date.parse(typedAt) - 1).toISOString();
    const oldest = await json<{ captures: Capture[] }>(await api.get(`/api/captures/review?order=oldest&limit=200&before=${encodeURIComponent(justBefore)}`));
    expect(mine(oldest.captures)).toEqual([typed.capture_id, plain.id, quote.id]);

    // a cursor pages through
    const page1 = await json<{ captures: Capture[]; next_cursor: string | null }>(await api.get("/api/captures/review?tab=all&limit=1"));
    expect(page1.captures).toHaveLength(1);
    expect(page1.next_cursor).toBe(page1.captures[0].created_at);
    const page2 = await json<{ captures: Capture[] }>(await api.get(`/api/captures/review?tab=all&limit=1&before=${encodeURIComponent(page1.next_cursor!)}`));
    expect(page2.captures[0].id).not.toBe(page1.captures[0].id);

    // approved: out of the queue, kept in ALL
    await review(plain.id, { action: "approve" });
    expect(await inQueue(plain.id)).toBe(false);
    expect((await queue("all")).find((c) => c.id === plain.id)?.reviewed_at).not.toBeNull();

    // discarded: out of both tabs, and final
    const gone = await review(typed.capture_id, { action: "discard" });
    expect(gone.capture.discarded_at).not.toBeNull();
    expect(await inQueue(typed.capture_id)).toBe(false);
    expect((await queue("all")).some((c) => c.id === typed.capture_id)).toBe(false);
    expect((await api.patch(`/api/captures/${typed.capture_id}/review`, { data: { action: "discard" } })).status()).toBe(409);
    expect((await api.patch(`/api/captures/${typed.capture_id}/review`, { data: { action: "approve" } })).status()).toBe(409);
    // the list of all captures still shows a discarded one; a deleted one is gone from everything
    const list = async () => (await json<{ captures: Capture[] }>(await api.get("/api/captures?limit=200"))).captures;
    expect((await list()).some((c) => c.id === typed.capture_id)).toBe(true);
    expect((await api.delete(`/api/captures/${quote.id}`)).status()).toBe(200);
    expect((await list()).some((c) => c.id === quote.id)).toBe(false);
    expect(await inQueue(quote.id)).toBe(false);
    expect((await queue("all")).some((c) => c.id === quote.id)).toBe(false);
    expect((await api.delete(`/api/captures/${quote.id}`)).status()).toBe(404);
  });

  test("the pending count is the queue: up one for a new card, down one when it is answered", async () => {
    // was FINDING capture-2: the count had its own filter and left typed captures out
    const count = async () => (await json<{ count: number }>(await api.get("/api/captures/review/pending-count"))).count;
    const before = await count();
    const typed = await submitTyped("note", FIXTURES.note.valid());
    expect(await count()).toBe(before + 1);
    const plain = await auto(`${T} the stopcock is behind the washing machine`);
    expect(await count()).toBe(before + 2);
    await review(typed.capture_id, { action: "approve", kind: "note", fields: FIXTURES.note.valid() });
    expect(await count()).toBe(before + 1);
    await review(plain.id, { action: "discard" });
    expect(await count()).toBe(before);
  });

  test("an approved quote leaves the queue for good", async () => {
    // was FINDING capture-7: the list tested "low confidence" without "not yet reviewed"
    const fields = FIXTURES.quote.valid();
    const typed = await submitTyped("quote", fields);
    await review(typed.capture_id, { action: "approve", kind: "quote", fields });
    expect(await inQueue(typed.capture_id)).toBe(false);
    const spoken = await auto(`quote: ${T} a stitch in time`);
    expect(await inQueue(spoken.id)).toBe(true);
    await review(spoken.id, { action: "approve", kind: "quote" });
    expect(await inQueue(spoken.id)).toBe(false);
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

  test("re-route: a spoken task that was really a decision loses its ticket", async () => {
    const spoken = await auto(`${T} todo keep the old van another year`);
    expect(spoken.routed_to).toBe("tickets");
    const out = await review(spoken.id, { action: "reroute", kind: "decision" });
    expect(out.capture).toMatchObject({ routed_to: "raw_captures", routed_id: spoken.id });
    expect(out.capture.classification.kind).toBe("decision");
    expect(ticket(spoken.routed_id!)).toBeNull();
    expect(await inQueue(spoken.id)).toBe(false);
    expect(learning(spoken.id)).toMatchObject({ predicted_kind: "task", approved_kind: "decision" });
  });
});

// ---------------------------------------------------------------------------

test.describe("One capture per client_uuid", () => {
  test("typed: the same id again is the same capture, and stores nothing", async () => {
    const client_uuid = crypto.randomUUID();
    const first = await submitTyped("note", { title: `${T} once only typed`, summary: "", tags: [] }, { client_uuid });
    const second = await api.post("/api/capture", { data: { typed: { kind: "note", fields: { title: `${T} once only typed`, summary: "", tags: [] } }, client_uuid } });
    expect(second.status()).toBe(200);
    expect(await json(second)).toEqual({ ok: true, status: "saved", deduplicated: true, capture_id: first.capture_id });
    // a different body under the same id is still the first capture, whichever way it is sent
    const third = await api.post("/api/capture", { data: { text: `${T} a different thought`, client_uuid } });
    expect(third.status()).toBe(202);
    expect(await json(third)).toEqual({ ok: true, status: "saved", capture_id: first.capture_id, deduplicated: true, summary: "Saved" });
    expect(localSql(`select count(*) from public.raw_captures where client_uuid = '${client_uuid}'`)[0][0]).toBe("1");
    expect(row(first.capture_id)!.raw_text).toBe(`${T} once only typed`);
    expect(localSql(`select count(*) from public.capture_learning where capture_id = '${first.capture_id}'`)[0][0]).toBe("1");
  });

  test("auto: the same id again is the same capture, and it is worked out once", async () => {
    const client_uuid = crypto.randomUUID();
    const text = `${T} todo once only auto fix the latch`;
    const first = await auto(text, { client_uuid });
    expect(first.routed_to).toBe("tickets");
    const second = await api.post("/api/capture", { data: { text, client_uuid } });
    expect(second.status()).toBe(202);
    expect(await json(second)).toEqual({ ok: true, status: "saved", capture_id: first.id, deduplicated: true, summary: "Saved" });
    const asTyped = await api.post("/api/capture", { data: { typed: { kind: "note", fields: { title: `${T} typed over an auto id`, summary: "", tags: [] } }, client_uuid } });
    expect(asTyped.status()).toBe(200);
    expect(await json(asTyped)).toEqual({ ok: true, status: "saved", deduplicated: true, capture_id: first.id });
    expect(localSql(`select count(*) from public.raw_captures where client_uuid = '${client_uuid}'`)[0][0]).toBe("1");
    expect(localSql(`select count(*) from public.tickets where title = '${first.classification.title}'`)[0][0]).toBe("1");
    expect(localSql(`select count(*) from public.capture_learning where capture_id = '${first.id}'`)[0][0]).toBe("1");
    expect(row(first.id)).toMatchObject({ raw_text: text, routed_id: first.routed_id });
  });

  test("two submits of one id at the same moment both succeed, and there is one capture", async () => {
    // was FINDING capture-3: the loser of the race was answered 500
    const typedId = crypto.randomUUID();
    const typedBody = { typed: { kind: "note", fields: { title: `${T} double tap`, summary: "", tags: [] } }, client_uuid: typedId };
    const typed = await Promise.all([api.post("/api/capture", { data: typedBody }), api.post("/api/capture", { data: typedBody })]);
    const typedRows = localSql(`select id from public.raw_captures where client_uuid = '${typedId}'`).map((r) => r[0]);
    captures.push(...typedRows);
    expect(typed.map((r) => r.status())).toEqual([200, 200]);
    const typedBodies = await Promise.all(typed.map((r) => json<{ capture_id: string; deduplicated?: boolean; status: string }>(r)));
    expect(typedRows).toHaveLength(1);
    expect(typedBodies.map((b) => b.capture_id)).toEqual([typedRows[0], typedRows[0]]);
    expect(typedBodies.map((b) => b.status)).toEqual(["saved", "saved"]);

    const autoId = crypto.randomUUID();
    const autoBody = { text: `${T} todo double tap fix the bell`, client_uuid: autoId };
    const spoken = await Promise.all([api.post("/api/capture", { data: autoBody }), api.post("/api/capture", { data: autoBody })]);
    const autoRows = localSql(`select id from public.raw_captures where client_uuid = '${autoId}'`).map((r) => r[0]);
    captures.push(...autoRows);
    expect(spoken.map((r) => r.status())).toEqual([202, 202]);
    expect(autoRows).toHaveLength(1);
    const done = await processed(autoRows[0]);
    // worked out once: one ticket, one learning row
    expect(done.routed_to).toBe("tickets");
    expect(localSql(`select count(*) from public.tickets where title = '${done.classification.title}'`)[0][0]).toBe("1");
    expect(localSql(`select count(*) from public.capture_learning where capture_id = '${autoRows[0]}'`)[0][0]).toBe("1");
  });
});

// ---------------------------------------------------------------------------

test.describe("Auto capture with cloud AI off", () => {
  /** What the pattern rules make of a sentence, and where the pipeline files it. Unchanged by the rebuild. */
  const AUTO: Array<{ say: string; kind: string; routed_to: string; urgency?: string }> = [
    { say: "the boiler pressure sits at one and a half bar", kind: "capture", routed_to: "raw_captures" },
    { say: "need to renew the passport this week", kind: "purchase", routed_to: "purchases", urgency: "this_week" },
    { say: "todo sweep the yard today", kind: "task", routed_to: "tickets", urgency: "today" },
    { say: "decided to keep the old van", kind: "decision", routed_to: "raw_captures" },
    { say: "what if the shed had a green roof", kind: "idea", routed_to: "raw_captures" },
    { say: "remember the gas meter is behind the hedge", kind: "note", routed_to: "raw_captures" },
    { say: "lovely walk this evening, grateful for the sunset", kind: "journal", routed_to: "daylog_days" },
    { say: "buy a new kettle", kind: "purchase", routed_to: "purchases" },
    { say: "bench 5x5 80kg", kind: "workout", routed_to: "raw_captures" },
    { say: "left knee hurts going downstairs", kind: "pain_log", routed_to: "exercise_pain_logs" },
    { say: "add to my watch list the long film", kind: "media", routed_to: "media_items" },
  ];

  for (const item of AUTO) {
    test(`"${item.say}" → ${item.kind}, filed in ${item.routed_to}, with a card`, async () => {
      const text = `${T} ${item.say}`;
      const saved = await autoCapture(api, text);
      captures.push(saved.capture_id);
      expect(Object.keys(saved).sort()).toEqual(["capture_id", "ok", "status", "summary"]);
      const done = await processed(saved.capture_id);

      // no model answered, so the pattern rules classified it — and the capture still went through
      expect(done).toMatchObject({ source: "web", llm_source: "regex", raw_text: text, dictation_text: text, text_source: "typed", text_edited: false, routed_to: item.routed_to, reviewed_at: null, parent_capture_id: null, process_error: null });
      expect(done.classification).toMatchObject({ kind: item.kind, urgency: item.urgency ?? "someday", title: text.split(/\s+/).slice(0, 7).join(" ").slice(0, 80) });
      expect(done.classification.pending, "the placeholder it was stored with is gone").toBeUndefined();
      expect(done.classification.typed).toBeUndefined();
      expect(done.processed_at).not.toBeNull();
      if (item.routed_to === "raw_captures") expect(done.routed_id).toBe(done.id);

      // every capture gets a card, filed or not
      expect(await inQueue(done.id)).toBe(true);
      expect((await queue("all")).some((c) => c.id === done.id)).toBe(true);
      // the learning row records the prediction; nobody chose anything
      expect(learning(done.id)).toMatchObject({ predicted_kind: item.kind, predicted_llm_source: "regex", chosen_kind: null, approved_kind: null, source: "web" });

      if (item.routed_to === "tickets") {
        const t = ticket(done.routed_id!)!;
        expect(t).toMatchObject({ title: done.classification.title, category: "inbox", kind: "task" });
        expect(t.suggested).not.toBeNull();
      }
      if (item.routed_to === "daylog_days") {
        const d = (await readDay(api, await appToday(api))).day;
        expect(done.routed_id).toBe(d.id);
        expect(d.transcript.filter((e) => e.text === text)).toMatchObject([{ role: "user", channel: "capture" }]);
      }
      if (item.kind === "workout") expect(done.classification.workout_route, "a workout is handed to the session router").toBeTruthy();
    });
  }

  test("a quote is held for review and nothing is filed until it is approved", async () => {
    const done = await auto(`quote: ${T} never trust a quiet server`);
    expect(done).toMatchObject({ routed_to: "raw_captures", llm_source: "regex" });
    expect(done.classification).toMatchObject({ kind: "quote", confidence: "low", quote: { text: `${T} never trust a quiet server`, is_own: true } });
    expect(await inQueue(done.id)).toBe(true);
    expect(localSql(`select count(*) from public.quotes where text = '${T} never trust a quiet server'`)[0][0]).toBe("0");
    const approved = await review(done.id, { action: "approve", kind: "quote" });
    expect(approved.capture.routed_to).toBe("quotes");
    expect(localSql(`select text from public.quotes where id = '${approved.capture.routed_id}'`)[0][0]).toBe(`${T} never trust a quiet server`);
  });

  test("“remind me … at 9am tomorrow” is set as a reminder; with no time it waits for its card", async () => {
    // was FINDING capture-4 (never a reminder from the form). The pattern rules do say "reminder" with AI off,
    // and give the time as "09:00" on "tomorrow"; lib/capture/reminderDue.ts turns that into a moment.
    const timed = await auto(`${T} remind me to call the dentist at 9am tomorrow`);
    expect(timed.classification).toMatchObject({ kind: "reminder", reminder: { time: "09:00", date: "tomorrow" } });
    expect(timed.routed_to).toBe("tickets");
    const t = ticket(timed.routed_id!)!;
    expect(t).toMatchObject({ kind: "reminder", category: "next" });
    expect(t.title).toContain("call the dentist");
    const due = localSql(`select to_char(remind_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') from public.tickets where id = '${timed.routed_id}'`)[0][0];
    expect(due).toBe(`${shift(londonNow().date, 1)} 09:00`);
    // set, and still shown once as a card
    expect(await inQueue(timed.id)).toBe(true);

    const untimed = await auto(`${T} remind me to water the plants`);
    expect(untimed.classification).toMatchObject({ kind: "reminder", reminder: { time: null, date: null } });
    expect(untimed).toMatchObject({ routed_to: "raw_captures", routed_id: untimed.id });
    expect(await inQueue(untimed.id), "waiting for review at once").toBe(true);
    expect(localSql(`select count(*) from public.tickets where kind = 'reminder' and title like '%${T}%water the plants%'`)[0][0]).toBe("0");
  });

  test("a long dump is split where the speaker said so; each item is held as an idea until its card is accepted", async () => {
    const parts = [
      `${T} I need to fix the gate latch before the weekend because it keeps sticking in the wet.`,
      "Also the shed roof wants a second coat of green paint when it is dry.",
      "Another thing, buy a new kettle for the office.",
      "Oh and decided to keep the old van for one more year.",
    ];
    const text = parts.join(" ");
    const parent = await auto(text);

    // the original is the record of what was said, not a card
    expect(parent.classification).toMatchObject({ kind: "capture", title: "4 items from one recording", split: { count: 4, by: "heuristic" } });
    expect(parent).toMatchObject({ routed_to: "raw_captures", routed_id: parent.id, dictation_text: text });
    expect(parent.reviewed_at).not.toBeNull();
    expect(flat(parent.raw_text)).toBe(text);
    expect(await inQueue(parent.id)).toBe(false);

    const items = childrenOf(parent.id);
    captures.push(...items.map((c) => c.id));
    expect(items.map((c) => c.segment_index)).toEqual([0, 1, 2, 3]);
    expect(items.map((c) => c.raw_text)).toEqual(parts);
    // the words of the items, joined, are the original
    expect(flat(items.map((c) => c.raw_text).join(" "))).toBe(flat(text));
    expect(items.map((c) => c.classification.kind)).toEqual(["task", "capture", "purchase", "decision"]);
    for (const c of items) {
      // held with the guess attached, NOT filed
      expect(c).toMatchObject({ status: "processed", routed_to: "raw_captures", routed_id: c.id, reviewed_at: null, llm_source: "regex" });
      expect(c.classification.held).toBe(true);
      expect(await inQueue(c.id)).toBe(true);
      expect(learning(c.id)).toMatchObject({ predicted_kind: c.classification.kind, chosen_kind: null });
    }
    expect(localSql(`select count(*) from public.tickets where title like '${T} I need to fix%'`)[0][0]).toBe("0");
    expect(localSql(`select count(*) from public.purchases where title like 'Another thing, buy%' and created_at > now() - interval '5 minutes'`)[0][0]).toBe("0");

    // accepting a card files it as what the guess says: the task becomes a ticket, in Next
    const [task, note, purchase] = items;
    const accepted = await review(task.id, { action: "approve" });
    expect(accepted.capture.routed_to).toBe("tickets");
    expect(accepted.capture.classification).toMatchObject({ kind: "task", held: false });
    expect(ticket(accepted.capture.routed_id)).toMatchObject({ category: "next", kind: "task", title: task.classification.title });
    const bought = await review(purchase.id, { action: "approve" });
    expect(bought.capture.routed_to).toBe("purchases");
    expect(localSql(`select count(*) from public.purchases where id = '${bought.capture.routed_id}'`)[0][0]).toBe("1");
    // an item whose guess is "a note" stays the capture it is
    const kept = await review(note.id, { action: "approve" });
    expect(kept.capture).toMatchObject({ routed_to: "raw_captures", routed_id: note.id });
    expect(kept.capture.classification.held).toBe(false);
    for (const c of [task, note, purchase]) expect(await inQueue(c.id)).toBe(false);
    expect(await inQueue(items[3].id)).toBe(true);
  });

  test("a short capture is one item whatever it says, and a long one about one thing is not split", async () => {
    const short = await auto(`${T} buy milk. Also decided to call the plumber.`);
    expect(childrenOf(short.id)).toEqual([]);
    expect(short.classification.split).toBeUndefined();
    expect(short.raw_text).toBe(`${T} buy milk. Also decided to call the plumber.`);

    // paragraphs: blank lines for a long text, never a changed word; what arrived is kept beside it
    const long =
      `${T} decided to keep the old van after talking it through with the garage this morning. The clutch is fine and the rust is only on the sills. ` +
      "They can weld those for a fair price next month. The tyres have another year in them at least. I will look again in the spring and see how it has fared over the winter.";
    const one = await auto(long);
    expect(childrenOf(one.id)).toEqual([]);
    expect(one.classification.kind).toBe("decision");
    expect(one.dictation_text).toBe(long);
    expect(one.raw_text).not.toBe(long);
    expect(one.raw_text).toContain("\n\n");
    expect(flat(one.raw_text)).toBe(long);
    expect(one.raw_text!.split(/\n\n+/).length).toBeGreaterThan(1);
  });

  test("a weight said aloud is logged at once, and still gets a card", async () => {
    const today = londonNow().date;
    const space = personalSpace(PHIL);
    const before = localSql(`select count(*) from public.body_metrics where space_id = '${space}' and date = '${today}'`)[0][0];
    test.skip(before !== "0", `Phil already has a body_metrics row for ${today} that this spec did not make`);
    try {
      const done = await auto(`weight 82.4 kg ${T}`);
      expect(done.classification).toMatchObject({ kind: "note", title: "Weight logged — 82.4 kg", tags: ["weight"], logged: { weight_kg: 82.4 } });
      expect(done).toMatchObject({ routed_to: "body_metrics", llm_source: "regex", reviewed_at: null });
      expect(localSql(`select date || '|' || weight || '|' || weight_unit from public.body_metrics where id = '${done.routed_id}'`)[0][0]).toBe(`${today}|82.4|kg`);
      expect(await inQueue(done.id)).toBe(true);
      // a sentence that only mentions kilos in passing is not a weigh-in
      const lift = await auto(`${T} bench 5x5 80kg`);
      expect(lift.classification.kind).toBe("workout");
      expect(lift.routed_to).toBe("raw_captures");
    } finally {
      await api.delete(`/api/body-metrics/${today}`);
    }
  });

  test("the capture route is for people: the cron bearer and no credentials are refused", async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, storageState: NO_SESSION });
    expect((await anon.post("/api/capture", { data: { text: `${T} anonymous` } })).status()).toBe(401);
    expect((await anon.post("/api/capture", { data: { text: `${T} cron` }, headers: { Authorization: "Bearer e2e-cron-secret" } })).status()).toBe(401);
    expect((await anon.post("/api/capture-audio", { multipart: { audio: { name: "n.m4a", mimeType: "audio/mp4", buffer: VOICE_NOTE } } })).status()).toBe(401);
    expect((await anon.get("/api/captures/review")).status()).toBe(401);
    expect((await anon.post("/api/worker/claim", { data: { worker: "nobody", kinds: ["transcribe"] } })).status()).toBe(401);
    expect((await anon.get("/api/cron/tickets-nightly")).status()).toBe(401);
    await anon.dispose();
    expect(localSql(`select count(*) from public.raw_captures where raw_text in ('${T} anonymous', '${T} cron')`)[0][0]).toBe("0");
  });
});

// ---------------------------------------------------------------------------

test.describe("Audio", () => {
  const WORKER = `e2e-pc-${T}`;

  test("a recording with no words: stored, queued for the PC, and the transcript makes it a capture", async ({ playwright }) => {
    const cron = await cronApi(playwright);
    const client_uuid = crypto.randomUUID();
    const saved = await sendAudio(api, { client_uuid });
    captures.push(saved.capture_id);
    expect(saved).toMatchObject({ summary: "Saved. The words will follow once it is transcribed.", transcription: "" });

    // stored under the capture's own folder; no words yet, so nothing to review yet
    const waiting = row(saved.capture_id)!;
    expect(waiting).toMatchObject({ status: "received", raw_text: null, audio_path: `${saved.capture_id}/audio.m4a`, source: "api", client_uuid });
    expect(localSql(`select count(*) from storage.objects where bucket_id = 'captures' and name = '${saved.capture_id}/audio.m4a'`)[0][0]).toBe("1");
    expect(await inQueue(saved.capture_id)).toBe(false);
    // one job, for the PC first and anyone after a wait
    expect(jobsFor(saved.capture_id)).toMatchObject([{ kind: "transcribe", status: "queued", lane: "any" }]);

    // the PC collects it: the job carries a signed link to the very bytes that were sent
    const job = await claimTranscription(cron, WORKER, saved.capture_id);
    expect(job.payload).toMatchObject({ capture_id: saved.capture_id, audio_ext: "m4a", language: "en" });
    const fetched = await fetch(String(job.payload.audio_url));
    expect(fetched.status).toBe(200);
    expect(Buffer.from(await fetched.arrayBuffer()).equals(VOICE_NOTE)).toBe(true);
    expect(row(saved.capture_id)!.status, "still waiting while the PC works").toBe("received");

    const words = `${T} decided to sell the trailer in the spring`;
    await finishTranscription(cron, WORKER, job.id, words);
    const done = await processed(saved.capture_id);
    expect(done).toMatchObject({ raw_text: words, dictation_text: words, text_source: "whisper_pc", routed_to: "raw_captures", llm_source: "regex" });
    expect(done.classification.kind).toBe("decision");
    expect(await inQueue(saved.capture_id)).toBe(true);
    expect(jobsFor(saved.capture_id)).toMatchObject([{ status: "done" }]);
    // a result posted by a worker that did not claim the job is refused
    expect((await cron.post("/api/worker/finish", { data: { id: job.id, worker: "someone-else", ok: true, result: { text: "hijacked" } } })).status()).toBe(409);
    expect(row(saved.capture_id)!.raw_text).toBe(words);
    await cron.dispose();
  });

  test("the same id for words and recording is one capture; sending the recording twice stores it once", async () => {
    const client_uuid = crypto.randomUUID();
    const text = `${T} decided to keep the trailer after all`;
    const first = await auto(text, { client_uuid, dictated: true });
    expect(first.text_source).toBe("dictation");

    const joined = await sendAudio(api, { client_uuid });
    expect(joined).toMatchObject({ capture_id: first.id, deduplicated: true, summary: "Saved" });
    const again = await sendAudio(api, { client_uuid });
    expect(again).toMatchObject({ capture_id: first.id, deduplicated: true });
    expect(localSql(`select count(*) from public.raw_captures where client_uuid = '${client_uuid}'`)[0][0]).toBe("1");
    expect(localSql(`select count(*) from storage.objects where bucket_id = 'captures' and name like '${first.id}/%'`)[0][0]).toBe("1");
    const after = row(first.id)!;
    expect(after).toMatchObject({ audio_path: `${first.id}/audio.m4a`, raw_text: text, status: "processed", routed_id: first.routed_id });
    // the words are already there, so this is the free second opinion: it waits for the PC, and is queued once
    expect(jobsFor(first.id)).toMatchObject([{ kind: "transcribe", status: "queued", lane: "pc" }]);
  });

  test("the recording first and the words second: the capture is worked out as soon as the words arrive", async () => {
    // Before the fix in app/api/capture/route.ts the words were stored on the waiting capture and then nothing
    // processed it until some later sweep.
    const client_uuid = crypto.randomUUID();
    const saved = await sendAudio(api, { client_uuid });
    captures.push(saved.capture_id);
    expect(row(saved.capture_id)!.status).toBe("received");
    const text = `${T} decided the words can come second`;
    const words = await autoCapture(api, text, { client_uuid, dictated: true });
    expect(words).toMatchObject({ capture_id: saved.capture_id, deduplicated: true });
    const done = await processed(saved.capture_id);
    expect(done).toMatchObject({ raw_text: text, dictation_text: text, text_source: "dictation", audio_path: `${saved.capture_id}/audio.m4a` });
    expect(done.classification.kind).toBe("decision");
    expect(await inQueue(saved.capture_id)).toBe(true);
    expect(localSql(`select count(*) from public.raw_captures where client_uuid = '${client_uuid}'`)[0][0]).toBe("1");
  });

  test("the transcript corrects dictation only where the words differ, and never over a hand edit", async ({ playwright }) => {
    const cron = await cronApi(playwright);
    const dictated = `${T} decided to keep the trailer for another year`;
    const make = async (extra: Record<string, unknown>) => {
      const client_uuid = crypto.randomUUID();
      const c = await auto(dictated, { client_uuid, dictated: true, ...extra });
      await sendAudio(api, { client_uuid });
      return c;
    };
    const same = await make({});
    const differs = await make({});
    const edited = await make({ edited: true });
    expect(edited.text_edited).toBe(true);

    // the same words with other punctuation and capitals: kept, and noted as checked
    let job = await claimTranscription(cron, WORKER, same.id);
    await finishTranscription(cron, WORKER, job.id, dictated.toUpperCase().replace("TRAILER", "trailer,") + ".");
    expect(row(same.id)).toMatchObject({ raw_text: dictated, text_source: "dictation" });
    expect(row(same.id)!.classification.whisper).toEqual({ checked: true, kept: "same_words" });

    // different words: the stored text is corrected, what arrived is kept beside it, the filing stands
    const heard = `${T} decided to keep the tractor for another year`;
    job = await claimTranscription(cron, WORKER, differs.id);
    await finishTranscription(cron, WORKER, job.id, heard);
    const corrected = row(differs.id)!;
    expect(corrected).toMatchObject({ raw_text: heard, dictation_text: dictated, text_source: "whisper_pc", status: "processed", routed_to: differs.routed_to, routed_id: differs.routed_id });
    expect(corrected.classification).toMatchObject({ kind: "decision", whisper: { checked: true, corrected: true } });

    // edited by hand: theirs, whatever the recording says
    job = await claimTranscription(cron, WORKER, edited.id);
    await finishTranscription(cron, WORKER, job.id, heard);
    expect(row(edited.id)).toMatchObject({ raw_text: dictated, text_source: "dictation", text_edited: true });
    expect(row(edited.id)!.classification.whisper).toEqual({ checked: true, kept: "edited_by_hand" });
    for (const c of [same, differs, edited]) expect(jobsFor(c.id).map((j) => j.status)).toEqual(["done"]);
    await cron.dispose();
  });

  test("what the audio route refuses, and voice typing with AI off", async () => {
    const none = await api.post("/api/capture-audio", { multipart: { text: "words but no file" } });
    expect(none.status()).toBe(400);
    expect(await json(none)).toEqual({ ok: false, status: "error", error: "audio file required" });
    const empty = await api.post("/api/capture-audio", { multipart: { audio: { name: "n.m4a", mimeType: "audio/mp4", buffer: Buffer.alloc(0) } } });
    expect(empty.status()).toBe(400);

    // the chat's microphone: words back, nothing stored — and with no model, a plain refusal
    const client_uuid = crypto.randomUUID();
    const only = await api.post("/api/capture-audio", { multipart: { audio: { name: "n.m4a", mimeType: "audio/mp4", buffer: VOICE_NOTE }, transcribe_only: "1", client_uuid } });
    expect(only.status()).toBe(503);
    expect(await json(only)).toMatchObject({ ok: false, status: "error", error: "transcription_unavailable" });
    expect(localSql(`select count(*) from public.raw_captures where client_uuid = '${client_uuid}'`)[0][0]).toBe("0");
  });
});

// ---------------------------------------------------------------------------

test.describe("Nothing is lost, and nothing waits for ever", () => {
  /** A capture as the route leaves it when the work after "saved" never ran. Inserted directly: no route can make one on purpose. */
  const stranded = (text: string | null, minutesOld: number): string => {
    const space = personalSpace(PHIL);
    const value = text === null ? "null" : `'${text}'`;
    const id = localSql(
      `insert into public.raw_captures (source, raw_text, dictation_text, text_source, status, classification, space_id, created_by, created_at) values ('web', ${value}, ${value}, ${text === null ? "null" : "'typed'"}, 'received', '{"kind":"capture","title":"stranded","pending":true}', '${space}', '${PHIL.id}', now() - interval '${minutesOld} minutes') returning id`,
    )[0][0];
    captures.push(id);
    return id;
  };

  test("a capture stored but never processed is finished by the sweep that follows any capture", async () => {
    const id = stranded(`${T} decided the sweep should find this`, 3);
    expect(row(id)!.status).toBe("received");
    expect(await inQueue(id), "not a card until it is processed").toBe(false);
    await auto(`${T} the next capture, whose sweep finds the stranded one`);
    const done = await processed(id, 30_000);
    expect(done.classification).toMatchObject({ kind: "decision" });
    expect(done.classification.pending).toBeUndefined();
    expect(done).toMatchObject({ routed_to: "raw_captures", llm_source: "regex" });
    expect(await inQueue(id)).toBe(true);
  });

  test("recordings still waiting for their words do not hold up the captures behind them", async () => {
    // Before the fix in lib/capture/sweep.ts the sweep read the five oldest unfinished captures; six recordings
    // with no transcript sat at the front for ever (they are skipped without an attempt being counted).
    for (let i = 0; i < 6; i++) stranded(null, 30 + i);
    const id = stranded(`${T} decided this one must not starve`, 3);
    await auto(`${T} a capture to set the sweep off`);
    const done = await processed(id, 30_000);
    expect(done.classification.kind).toBe("decision");
  });

  test("the seven-day rule: a card nobody answered files itself, tagged unreviewed; a held item stays an idea", async ({ playwright }) => {
    const cron = await cronApi(playwright);
    const plain = await auto(`${T} decided seven days is long enough`);
    const task = await auto(`${T} todo seven day old task`);
    const dump = await auto(
      `${T} I need to seven day fix the gate latch before the weekend because it keeps sticking in the wet. Also the shed roof wants a second coat of green paint when it is dry. Another thing, buy a new kettle for the office.`,
    );
    const items = childrenOf(dump.id);
    captures.push(...items.map((c) => c.id));
    expect(items.map((c) => c.classification.kind)).toEqual(["task", "capture", "purchase"]);
    const fresh = await auto(`${T} decided today, so it stays a card`);

    // a week passes for the first three (rows this test made)
    const old = [plain.id, task.id, ...items.map((c) => c.id)].map((id) => `'${id}'`).join(",");
    localSql(`update public.raw_captures set created_at = created_at - interval '8 days' where id in (${old})`);

    const res = await cron.get("/api/cron/tickets-nightly");
    expect(res.status(), await res.text()).toBe(200);
    const report = await json<{ ok: boolean; captures: { auto_filed: number; users: number } }>(res);
    expect(report.ok).toBe(true);
    expect(report.captures.auto_filed).toBeGreaterThanOrEqual(5);
    await cron.dispose();

    for (const id of [plain.id, task.id, ...items.map((c) => c.id)]) {
      const r = row(id)!;
      expect(r.auto_filed_at, `${id} filed itself`).not.toBeNull();
      expect(r.reviewed_at).not.toBeNull();
      expect(r.classification.unreviewed).toBe(true);
      expect(await inQueue(id)).toBe(false);
    }
    // what was already filed stays filed, and its ticket can be found by the tag
    expect(row(plain.id)!.classification.kind).toBe("decision");
    expect(ticket(task.routed_id!)!.tags).toContain("unreviewed");
    // a held item is not turned into a commitment because nobody looked: it is an idea, with the guess kept
    const heldTask = row(items[0].id)!;
    expect(heldTask.classification).toMatchObject({ kind: "idea", suggested_kind: "task", held: false });
    expect(heldTask).toMatchObject({ routed_to: "raw_captures", routed_id: heldTask.id });
    expect(row(items[2].id)!.classification).toMatchObject({ kind: "idea", suggested_kind: "purchase" });
    expect(localSql(`select count(*) from public.tickets where title like '${T} I need to seven day%'`)[0][0]).toBe("0");

    // today's capture is untouched
    expect(row(fresh.id)).toMatchObject({ auto_filed_at: null, reviewed_at: null });
    expect(await inQueue(fresh.id)).toBe(true);
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
  const sent = (page: Page) => page.waitForResponse((r) => new URL(r.url()).pathname === "/api/capture" && r.request().method() === "POST");
  const reviewed = (page: Page) => page.waitForResponse((r) => /\/api\/captures\/.+\/review$/.test(new URL(r.url()).pathname) && r.request().method() === "PATCH");

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
    let posts = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/capture") posts++;
    });
    await dialog.getByLabel("Capture type").selectOption("reminder");
    await dialog.locator("#ef-reminder-message").fill(`${T} reminder with no time`);
    await dialog.getByRole("button", { name: "Capture Reminder →" }).click();
    await expect(dialog.locator("#ef-reminder-date")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.locator("#ef-reminder-time")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText("Date", { exact: true }).last()).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(posts).toBe(0);
  });

  test("a typed note: captured, shown in review with its form filled in, approved in one tap", async ({ page }) => {
    const seen = watch(page);
    const text = `${T} browser note the stopcock is under the sink`;
    const dialog = await openCapture(page);
    await dialog.getByLabel("Capture type").selectOption("note");
    await dialog.locator("#ef-note-title").fill(text);
    await dialog.locator("#ef-note-summary").fill("left of the U-bend");
    const posted = sent(page);
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
    const posted = sent(page);
    await dialog.locator("#ef-task-title").press("Control+Enter");
    const res = await posted;
    expect(res.status()).toBe(200);
    const answer = (await res.json()) as TypedAnswer;
    captures.push(answer.capture_id);
    expect(answer.review).toBe("tickets_inbox");
    await expect(page.getByRole("status")).toHaveText(`✓ Captured → Inbox · ${answer.ticket_key}`);
    const made = await api.get(`/api/tickets/${answer.ticket_key}`);
    expect(made.status()).toBe(200);
    expect(JSON.stringify(await made.json())).toContain(text);
  });

  test("Auto in the browser: saved at once, then a card to accept, and no error on the page", async ({ page }) => {
    // also what was FINDING capture-9: the ripple the background draws after a capture used to throw now and then
    const seen = watch(page);
    const text = `${T} browser auto decided the loft hatch key lives in the red tin`;
    const dialog = await openCapture(page);
    await dialog.getByPlaceholder("Capture a thought, task, or decision…").fill(text);
    const posted = sent(page);
    await dialog.getByRole("button", { name: "Capture →" }).click();
    const res = await posted;
    expect(res.status()).toBe(202);
    const saved = (await res.json()) as { capture_id: string; status: string };
    captures.push(saved.capture_id);
    expect(saved.status).toBe("saved");
    await expect(page.getByRole("status")).toHaveText("✓ Captured → Review");
    await processed(saved.capture_id);

    await page.goto("/organisation/captures/review");
    const c = card(page, text);
    await expect(c).toBeVisible();
    await expect(c).toContainText("via regex");
    await expect(c.getByLabel("Kind")).toHaveValue("decision");
    const done = reviewed(page);
    await c.getByRole("button", { name: "APPROVE" }).click();
    expect((await done).status()).toBe(200);
    await expect(card(page, text)).toHaveCount(0);
    expect(row(saved.capture_id)!.reviewed_at).not.toBeNull();
    expect(seen.serverErrors).toEqual([]);
    expect(seen.crashes).toEqual([]);
    expect(seen.ambient).toEqual([]);
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
    let patches = 0;
    page.on("request", (r) => {
      if (r.method() === "PATCH" && r.url().includes("/review")) patches++;
    });
    await c.getByRole("button", { name: "APPROVE" }).click();
    await expect(c.locator("#ef-reminder-date")).toHaveAttribute("aria-invalid", "true");
    expect(patches).toBe(0);
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
    expect(row(answer.capture_id)!.discarded_at).not.toBeNull();
  });

  test("where a capture went is a link, on the list and on its card", async ({ page }) => {
    // was FINDING capture-5: both screens looked the destination up under names that were never stored
    const answer = await submitTyped("task", { title: `${T} browser link to the ticket`, description: "", due_window: "", key: false, tags: [] });
    await page.goto(`/organisation/captures?focus=${answer.capture_id}`);
    await expect(page.locator(`#capture-${answer.capture_id}`).getByRole("link")).toHaveAttribute("href", `/work/browse/${answer.routed_id}`);
    await page.goto("/organisation/captures/review");
    await expect(card(page, `${T} browser link to the ticket`).getByRole("link")).toHaveAttribute("href", `/work/browse/${answer.routed_id}`);
  });
});
