/**
 * Plans (spec §7) against a fake database: propose, the two answers, what
 * acceptance writes, expiry, conflicts, and the engine's limits. The engine
 * fit, the calendar adapter and the notifier are faked; the rules here are
 * the state changes and who is told what.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { londonTime } from "./engine";
import type { PmCtx } from "./server";
import { makeFakeDb, type Row } from "./testing/fakeDb";
import type { FitResult } from "./types";

const notified: Row[] = [];
vi.mock("./notify", () => ({
  notifyPerson: async (_db: unknown, _s: string, pid: string, input: Row) => (notified.push({ pid, ...input }), { id: "n", sent_via: "push" }),
  notifyPeople: async (_db: unknown, _s: string, pids: string[], input: Row) => pids.map((pid) => (notified.push({ pid, ...input }), { id: "n", sent_via: "push" })),
}));
const calendar = { written: [] as Row[], removed: [] as string[], notes: [] as Row[] };
vi.mock("./adapter", () => ({
  writePlanToCalendar: async (_db: unknown, _ctx: unknown, plan: Row, legs: Row[]) => (calendar.written.push({ plan, legs }), "entry-1"),
  removePlanFromCalendar: async (_db: unknown, _ctx: unknown, plan: Row) => (calendar.removed.push(plan.id as string), true),
  seedTimelineNote: async (_db: unknown, _ctx: unknown, plan: Row, note: string | null) => (calendar.notes.push({ plan, note }), "note-1"),
}));
const t = (day: string, hhmm: string) => londonTime(day, hhmm);
const DAY = "2026-11-28";
const fitting = {
  fit: null as FitResult | null,
  windows: [] as Array<{ start: number; end: number; firmness: string; day: string; minutes: number; tentative: boolean; people: never[] }>,
  ranked: [] as Array<{ thing: Row; fit: FitResult; score: number; reasons: string[] }>,
  blocks: {} as Record<string, Array<{ kind: string; start: number; end: number }>>,
};
vi.mock("./fitting", () => ({
  fitForWindow: async () => ({ fit: fitting.fit, ctx: { places: [{ id: "home-p", label: "Home" }], windows: fitting.windows, blocks: fitting.blocks, people: [] } }),
  loadFitContext: async () => ({ windows: fitting.windows, blocks: fitting.blocks, places: [], people: [], hasPet: false, dayOverrides: {}, range: { start: 0, end: 0 } }),
  thingsForWindow: async () => fitting.ranked,
}));

const { proposePlan, respondToPlan, cancelPlan, markDone, listPlans, expireProposals, markConflicts, engineProposals, leaveByReminders } = await import("./plans");

const SPACE = "space-1";
const NOW = new Date("2026-11-22T10:00:00Z");
const person = (id: string, name: string) => ({ id, row_id: `row-${id}`, person_id: id, name, colour: "#000", has_car: true, waking: { weekday: { start: "07:00", end: "23:00" }, weekend: { start: "08:00", end: "00:30" } }, buffers: { shift: 15, sit: 30, walk: 15 }, home_place_id: `home-${id}`, settings: {}, inbox_token_hint: null, updated_at: "" });
const ctxFor = (uid: string, people = [person("phil", "Phil"), person("kirsty", "Kirsty")]): PmCtx => {
  const me = people.find((p) => p.id === uid)!;
  return { supabase: null as unknown as PmCtx["supabase"], uid, spaceId: SPACE, profile: { id: "fp", space_id: SPACE, due_on: null, born_on: null, baby_name: null, created_at: "" }, members: [], people: [me, ...people.filter((p) => p !== me)], me } as PmCtx;
};
const goodFit = (): FitResult => ({
  verdict: "fits",
  reason: "Fits",
  window: { start: t(DAY, "12:00"), end: t(DAY, "18:00"), firmness: "firm", day: DAY },
  legs: [
    { person_id: "phil", from_place_id: "home-p", leave_at: t(DAY, "12:10"), travel_minutes: 55, arrive_at: t(DAY, "13:05"), mode: "drive", provider: "ors" },
    { person_id: "kirsty", from_place_id: "home-k", leave_at: t(DAY, "12:25"), travel_minutes: 40, arrive_at: t(DAY, "13:05"), mode: "drive", provider: "estimate" },
  ],
  arrive_at: t(DAY, "13:05"),
  leave_at: t(DAY, "16:30"),
  minutes_there: 205,
  mode: "meet",
});

let fake: ReturnType<typeof makeFakeDb>;
const plans = () => fake.tables.pm_plans;
const input = { thing_id: "thing-1", starts_at: new Date(t(DAY, "13:00")).toISOString(), ends_at: new Date(t(DAY, "17:00")).toISOString() };

beforeEach(() => {
  fake = makeFakeDb({ pm_plans: [], pm_plan_responses: [], pm_plan_legs: [], pm_things: [{ id: "thing-1", space_id: SPACE, name: "Hackfall Woods", done_count: 0, kind: "walk" }] });
  notified.length = 0;
  calendar.written = [];
  calendar.removed = [];
  calendar.notes = [];
  fitting.fit = goodFit();
  fitting.windows = [];
  fitting.ranked = [];
  fitting.blocks = {};
});

describe("propose and answer (spec §7 states)", () => {
  it("a proposal records the proposer's yes, expires at the window start and tells the other person without counting", async () => {
    const r = await proposePlan(fake.client, ctxFor("phil"), input);
    expect(r.ok).toBe(true);
    const plan = plans()[0];
    expect(plan).toMatchObject({ status: "proposed", kind: "plan", title: "Hackfall Woods", proposed_by: "phil", expires_at: input.starts_at });
    expect(fake.tables.pm_plan_responses).toEqual([expect.objectContaining({ plan_id: plan.id, person_id: "phil", answer: "yes" })]);
    expect(notified).toEqual([expect.objectContaining({ pid: "kirsty", kind: "proposal", title: "Phil proposes Hackfall Woods", counts: false, url: "/phirstmaxx/plans" })]);
    expect((notified[0].body as string).startsWith("Sat 28 Nov, 13:00–17:00. Yes or No?")).toBe(true);
  });

  it("both yes: accepted, legs stored, written to the Family calendar, everyone told it's on with the leave-by time", async () => {
    await proposePlan(fake.client, ctxFor("phil"), input);
    notified.length = 0;
    const r = await respondToPlan(fake.client, ctxFor("kirsty"), plans()[0].id as string, "yes");
    expect(r.ok && r.plan.status).toBe("accepted");
    expect(plans()[0]).toMatchObject({ status: "accepted", calendar_entry_id: "entry-1" });
    expect(fake.tables.pm_plan_legs.map((l) => `${l.person_id}:${l.kind}`)).toHaveLength(10);
    expect(calendar.written).toHaveLength(1);
    expect(notified.map((n) => n.pid).sort()).toEqual(["kirsty", "phil"]);
    expect(notified[0]).toMatchObject({ kind: "accepted", title: "Both agreed — it's on: Hackfall Woods", counts: false });
    expect(notified[0].body).toContain("Leave by 12:10.");
  });

  it("one no: declined, the proposer told", async () => {
    await proposePlan(fake.client, ctxFor("phil"), input);
    notified.length = 0;
    const r = await respondToPlan(fake.client, ctxFor("kirsty"), plans()[0].id as string, "no");
    expect(r.ok && r.plan.status).toBe("declined");
    expect(notified).toEqual([expect.objectContaining({ pid: "phil", kind: "declined", title: "Kirsty said no to Hackfall Woods", counts: false })]);
    expect(calendar.written).toHaveLength(0);
    // nothing more can be said about it
    expect(await respondToPlan(fake.client, ctxFor("kirsty"), plans()[0].id as string, "yes")).toMatchObject({ ok: false, status: 409 });
  });

  it("another time: stays proposed, the proposer told", async () => {
    await proposePlan(fake.client, ctxFor("phil"), input);
    notified.length = 0;
    const r = await respondToPlan(fake.client, ctxFor("kirsty"), plans()[0].id as string, "another_time");
    expect(r.ok && r.plan.status).toBe("proposed");
    expect(notified).toEqual([expect.objectContaining({ pid: "phil", kind: "another_time" })]);
  });

  it("alone in the space, a proposal is accepted at once", async () => {
    const r = await proposePlan(fake.client, ctxFor("phil", [person("phil", "Phil")]), input);
    expect(r.ok && r.plan.status).toBe("accepted");
    expect(notified[0]).toMatchObject({ pid: "phil", title: "It's on: Hackfall Woods" });
  });

  it("a hold has no thing and no legs; bad input is refused", async () => {
    const r = await proposePlan(fake.client, ctxFor("phil"), { thing_id: null, starts_at: input.starts_at, ends_at: input.ends_at });
    expect(r.ok && r.plan).toMatchObject({ kind: "hold", title: "Held for us" });
    expect(await proposePlan(fake.client, ctxFor("phil"), { thing_id: null, starts_at: input.ends_at, ends_at: input.starts_at })).toMatchObject({ ok: false, status: 400 });
    expect(await proposePlan(fake.client, ctxFor("phil"), { ...input, thing_id: "missing" })).toMatchObject({ ok: false, status: 404 });
  });

  it("cancel takes the appointment off the calendar and tells the other; done seeds the timeline note and counts on the thing", async () => {
    await proposePlan(fake.client, ctxFor("phil"), input);
    await respondToPlan(fake.client, ctxFor("kirsty"), plans()[0].id as string, "yes");
    notified.length = 0;
    const done = await markDone(fake.client, ctxFor("phil"), plans()[0].id as string, "Lovely.");
    expect(done.ok && done.plan.status).toBe("done");
    expect(calendar.notes).toEqual([expect.objectContaining({ note: "Lovely." })]);
    expect(fake.tables.pm_things[0].done_count).toBe(1);
    expect(await cancelPlan(fake.client, ctxFor("phil"), plans()[0].id as string)).toMatchObject({ ok: false, status: 409 });

    await proposePlan(fake.client, ctxFor("phil"), input);
    const second = plans()[1].id as string;
    notified.length = 0;
    const c = await cancelPlan(fake.client, ctxFor("kirsty"), second);
    expect(c.ok && c.plan.status).toBe("cancelled");
    expect(notified).toEqual([expect.objectContaining({ pid: "phil", kind: "cancelled", title: "Kirsty cancelled Hackfall Woods" })]);
  });

  it("listPlans carries responses and legs", async () => {
    await proposePlan(fake.client, ctxFor("phil"), input);
    const list = await listPlans(fake.client, SPACE, { status: ["proposed"] });
    expect(list).toHaveLength(1);
    expect(list[0].responses).toHaveLength(1);
    expect(list[0].legs).toEqual([]);
  });
});

describe("the cron's work", () => {
  it("unanswered proposals expire at the window start; accepted ones do not", async () => {
    await proposePlan(fake.client, ctxFor("phil"), input);
    await proposePlan(fake.client, ctxFor("phil"), { ...input, title: "Later", starts_at: new Date(t("2026-12-05", "13:00")).toISOString(), ends_at: new Date(t("2026-12-05", "17:00")).toISOString() });
    await proposePlan(fake.client, ctxFor("phil"), { ...input, title: "Agreed" });
    await respondToPlan(fake.client, ctxFor("kirsty"), plans()[2].id as string, "yes");
    expect(await expireProposals(fake.client, SPACE, new Date(t(DAY, "13:00") + 1))).toBe(1);
    expect(plans().map((p) => p.status)).toEqual(["expired", "proposed", "accepted"]);
    expect(await expireProposals(fake.client, SPACE, new Date(t(DAY, "13:00") + 1))).toBe(0);
  });

  it("an accepted plan no longer inside a together-window is flagged once, with the reason, and cleared when it fits again", async () => {
    await proposePlan(fake.client, ctxFor("phil"), input);
    await respondToPlan(fake.client, ctxFor("kirsty"), plans()[0].id as string, "yes");
    notified.length = 0;
    fitting.windows = [];
    fitting.blocks = { kirsty: [{ kind: "shift", start: t(DAY, "14:00"), end: t(DAY, "20:00") }] };
    const r1 = await markConflicts(fake.client, ctxFor("phil"), NOW);
    expect(r1).toEqual({ flagged: 1, cleared: 0 });
    expect(plans()[0].conflict).toBe("Kirsty now has shift 14:00–20:00");
    expect(notified.map((n) => n.pid).sort()).toEqual(["kirsty", "phil"]);
    expect(notified[0]).toMatchObject({ kind: "conflict", counts: true });
    notified.length = 0;
    await markConflicts(fake.client, ctxFor("phil"), NOW);
    expect(notified).toEqual([]);
    fitting.windows = [{ start: t(DAY, "12:00"), end: t(DAY, "18:00"), firmness: "firm", day: DAY, minutes: 360, tentative: false, people: [] }];
    fitting.blocks = {};
    expect(await markConflicts(fake.client, ctxFor("phil"), NOW)).toEqual({ flagged: 0, cleared: 1 });
    expect(plans()[0].conflict).toBeNull();
  });

  it("the engine proposes into firm windows of three hours or more, at most two a week, never two for one window, and tells both (counted)", async () => {
    const w = (day: string, from: string, to: string, minutes: number, firmness = "firm") => ({ start: t(day, from), end: t(day, to), firmness, day, minutes, tentative: false, people: [] as never[] });
    fitting.windows = [w("2026-11-23", "18:00", "20:00", 120), w("2026-11-28", "12:00", "18:00", 360), w("2026-11-29", "12:00", "18:00", 360, "flexible"), w("2026-12-05", "10:00", "17:00", 420), w("2026-12-06", "10:00", "17:00", 420)];
    fitting.ranked = [{ thing: { id: "thing-1", name: "Hackfall Woods" }, fit: goodFit(), score: 80, reasons: ["free", "you haven't done it yet"] }];
    fitting.fit = null;
    const made = await engineProposals(fake.client, ctxFor("phil"), NOW);
    expect(made).toHaveLength(1); // the one ranked thing is then taken; a second window gets nothing
    expect(made[0]).toMatchObject({ proposed_by: "engine", thing_id: "thing-1", starts_at: new Date(t(DAY, "13:05")).toISOString(), notes: "free, you haven't done it yet" });
    expect(fake.tables.pm_plan_responses).toEqual([]);
    expect(notified.filter((n) => n.kind === "engine_proposal").map((n) => n.pid).sort()).toEqual(["kirsty", "phil"]);
    expect(notified[0]).toMatchObject({ counts: true, title: "How about Hackfall Woods?" });

    // a second thing: two a week is the ceiling, and the window with a plan is skipped
    fitting.ranked = [
      { thing: { id: "thing-1", name: "Hackfall Woods" }, fit: goodFit(), score: 80, reasons: [] },
      { thing: { id: "thing-2", name: "Brimham Rocks" }, fit: goodFit(), score: 70, reasons: [] },
    ];
    fake.tables.pm_things.push({ id: "thing-2", space_id: SPACE, name: "Brimham Rocks" });
    const more = await engineProposals(fake.client, ctxFor("phil"), NOW);
    expect(more).toHaveLength(1);
    expect(more[0].thing_id).toBe("thing-2");
    expect(await engineProposals(fake.client, ctxFor("phil"), NOW)).toEqual([]);
    expect(plans().filter((p) => p.proposed_by === "engine")).toHaveLength(2);
  });

  it("leave-by reminders go once per person inside the two hours before they must leave", async () => {
    await proposePlan(fake.client, ctxFor("phil"), input);
    await respondToPlan(fake.client, ctxFor("kirsty"), plans()[0].id as string, "yes");
    notified.length = 0;
    expect(await leaveByReminders(fake.client, ctxFor("phil"), new Date(t(DAY, "09:00")))).toBe(0);
    expect(await leaveByReminders(fake.client, ctxFor("phil"), new Date(t(DAY, "10:20")))).toBe(1); // Phil leaves 12:10; Kirsty 12:25 is still over two hours off
    expect(notified).toEqual([expect.objectContaining({ pid: "phil", kind: "leave_by", title: "Leave by 12:10 for Hackfall Woods", counts: true })]);
    expect(await leaveByReminders(fake.client, ctxFor("phil"), new Date(t(DAY, "10:30")))).toBe(1);
    expect(await leaveByReminders(fake.client, ctxFor("phil"), new Date(t(DAY, "11:00")))).toBe(0);
  });
});
