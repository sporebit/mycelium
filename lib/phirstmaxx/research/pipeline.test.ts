/**
 * The research pipeline's rules, against a fake database and fake stages:
 * the order and the dependency rule, the back-off, the paid gate, the fold
 * of facts into columns, the sentence the dropper gets. No network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type Row } from "../testing/fakeDb";

vi.mock("@/lib/jobs/handlers", () => ({ registerJobHandler: () => undefined }));
vi.mock("@/lib/ai/budget", () => ({ cloudAllowed: async () => true }));
vi.mock("@/lib/ai/usage", () => ({ recordUsage: async () => undefined, costPence: () => 0 }));
const notified: Row[] = [];
vi.mock("../notify", () => ({ notifyPerson: async (_db: unknown, _s: string, pid: string, input: Row) => (notified.push({ pid, ...input }), { id: "n1", sent_via: "push" }) }));
const enqueued: Row[] = [];
vi.mock("../server", () => ({
  RESEARCH_JOB: "pm_research",
  DROP_COLS: "id, person_id, client_id, source, url, text, media_paths, received_at, thing_id, question, answer, old_id",
  PEOPLE_COLS: "id, person_id, name",
  PLACE_COLS: "id, label",
  startResearch: async (_db: unknown, spaceId: string, dropId: string, opts: Row) => (enqueued.push({ spaceId, dropId, ...opts }), undefined),
}));

const { backoffMinutes, decideStage, paidDecision, foldFacts, researchSentence, kindFromHints, runPipeline, NOT_ALLOWED_REASON, MAX_STAGE_ATTEMPTS, answerQuestion, researchStatus } = await import("./pipeline");
import type { StageFn, StageTable } from "./pipeline";

const SPACE = "space-1";
const NOW = Date.parse("2026-11-22T10:00:00Z");
const MIN = 60_000;

describe("back-off and stage decisions", () => {
  it("doubles from a minute and stops at an hour", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffMinutes)).toEqual([2, 4, 8, 16, 32, 60, 60, 60]);
  });

  it("queued runs; done skips; failed runs when due and holds before; waiting holds; a dead dependency blocks", () => {
    const run = (status: string, attempts = 0, runAfter = NOW) => ({ status, attempts, run_after: new Date(runAfter).toISOString() }) as Parameters<typeof decideStage>[0];
    expect(decideStage(run("queued"), [], NOW, false)).toBe("run");
    expect(decideStage(run("done"), [], NOW, false)).toBe("skip");
    expect(decideStage(run("done"), [], NOW, true)).toBe("run");
    expect(decideStage(run("failed", 1, NOW + MIN), [], NOW, false)).toBe("hold");
    expect(decideStage(run("failed", 1, NOW - MIN), [], NOW, false)).toBe("run");
    expect(decideStage(run("failed", MAX_STAGE_ATTEMPTS), [], NOW, false)).toBe("skip");
    expect(decideStage(run("waiting"), [], NOW, false)).toBe("hold");
    expect(decideStage(run("queued"), [run("failed", 1)], NOW, false)).toBe("blocked");
    expect(decideStage(run("queued"), [run("done")], NOW, false)).toBe("run");
  });
});

describe("the paid rule (spec §11.5)", () => {
  it("absent cap: not yet allowed, with the checklist reason", () => {
    expect(paidDecision({ hasKey: true, cap: undefined, sharedAllowed: true, monthSpentPence: 0 })).toEqual({ allowed: false, reason: NOT_ALLOWED_REASON, mode: "none" });
    expect(paidDecision({ hasKey: true, cap: null, sharedAllowed: true, monthSpentPence: 0 }).allowed).toBe(false);
  });
  it("zero: the shared £5 cap decides", () => {
    expect(paidDecision({ hasKey: true, cap: 0, sharedAllowed: true, monthSpentPence: 0 })).toMatchObject({ allowed: true, mode: "shared" });
    expect(paidDecision({ hasKey: true, cap: 0, sharedAllowed: false, monthSpentPence: 0 })).toMatchObject({ allowed: false, reason: expect.stringContaining("£5") });
  });
  it("a figure: PhirstMaxx's own monthly cap against the runs' spend", () => {
    expect(paidDecision({ hasKey: true, cap: 300, sharedAllowed: false, monthSpentPence: 299 })).toMatchObject({ allowed: true, mode: "own" });
    expect(paidDecision({ hasKey: true, cap: 300, sharedAllowed: false, monthSpentPence: 300 })).toMatchObject({ allowed: false, reason: "PhirstMaxx's monthly research cap (£3.00) is spent" });
  });
  it("no key: never", () => {
    expect(paidDecision({ hasKey: false, cap: 0, sharedAllowed: true, monthSpentPence: 0 })).toMatchObject({ allowed: false, mode: "nokey" });
    expect(paidDecision({ hasKey: false, cap: null, sharedAllowed: true, monthSpentPence: 0 }).reason).toBe(NOT_ALLOWED_REASON);
  });
});

describe("folding facts into the thing's columns", () => {
  const fact = (key: string, value: unknown, confidence = 0.7, extra: Partial<{ edited_by_user: boolean; checked_at: string }> = {}) => ({ key, value, confidence, checked_at: "2026-11-22T09:00:00Z", edited_by_user: false, ...extra });
  it("takes the best fact per key and leaves hand-edited columns alone", () => {
    const cols = foldFacts({ hand_edited: ["cost_pence"], kind: null, lat: null, lng: null }, [
      fact("typical_minutes", { min: 120, max: 240 }, 0.6),
      fact("dog_rule", "no", 0.7),
      fact("dog_rule", "yes", 0.9),
      fact("price", { adult_pence: 500, free: false }, 0.9),
      fact("indoor", false, 0.7),
      fact("summary", "A gorge of follies.", 0.6),
      fact("osm_kind", "tourism=attraction", 0.7),
      fact("geo", { lat: 54.2, lng: -1.7 }, 0.7),
      fact("seasons", ["spring", "autumn"], 0.5),
    ]);
    expect(cols).toEqual({ min_minutes: 120, max_minutes: 240, indoor: false, dog_rule: "yes", summary: "A gorge of follies.", kind: "activity", lat: 54.2, lng: -1.7, seasons: ["spring", "autumn"] });
  });
  it("a hand edit outranks confidence; a free fee is £0", () => {
    const cols = foldFacts({ hand_edited: [], kind: "walk", lat: 54, lng: -1 }, [fact("dog_rule", "yes", 0.9), fact("dog_rule", "outside_only", 0.3, { edited_by_user: true }), fact("fee", false, 0.7), fact("kind", "garden", 0.5)]);
    expect(cols).toMatchObject({ dog_rule: "outside_only", cost_pence: 0, kind: "garden" });
    expect(cols.lat).toBeUndefined();
  });
  it("kinds from hints", () => {
    expect(kindFromHints(["leisure=park"])).toBe("park");
    expect(kindFromHints(["cafe", "food"])).toBe("cafe");
    expect(kindFromHints(["historic=castle"])).toBe("historic");
    expect(kindFromHints(["nothing"])).toBeNull();
  });
});

describe("the sentence to the dropper (spec §6.6)", () => {
  it("55 min each way, about 3 h there, fits this Saturday", () => {
    expect(researchSentence({ name: "Hackfall Woods", eachWayMinutes: 55, minMinutes: 150, maxMinutes: 210, nextFitText: "next fits: Sat 28 Nov, 13:00–17:30, leave by 12:10" })).toBe("Hackfall Woods — 55 min each way, about 3 h there, fits Sat 28 Nov.");
    expect(researchSentence({ name: "X", eachWayMinutes: null, minMinutes: null, maxMinutes: null, nextFitText: null, matched: true })).toBe("X — no window for it in the next eight weeks yet. Already in your things.");
    expect(researchSentence({ name: "X", eachWayMinutes: 20, minMinutes: 60, maxMinutes: null, nextFitText: "next tight fit: Sun 29 Nov, 10:00–11:10, leave by 09:40" })).toBe("X — 20 min each way, about 1 h there, a tight fit Sun 29 Nov.");
  });
});

// ---------------------------------------------------------------------------

const drop = (over: Row = {}): Row => ({ id: "drop-1", space_id: SPACE, person_id: "phil", client_id: "c1", source: "app", url: "https://example.org/x", text: null, media_paths: [], received_at: new Date(NOW).toISOString(), thing_id: null, question: null, answer: null, old_id: null, ...over });
const ok: StageFn = async () => ({ detail: { ran: true } });
const boom: StageFn = async () => {
  throw new Error("nope");
};
const quiet = (stages: Partial<StageTable>): Partial<StageTable> => ({ read: ok, resolve: ok, enrich: ok, travel: ok, fit: ok, notify: ok, ...stages });

describe("the walk: order, dependencies, back-off (spec §2.2)", () => {
  let fake: ReturnType<typeof makeFakeDb>;
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "test-key"));
  const runs = () => Object.fromEntries(fake.tables.pm_research_runs.map((r) => [r.stage, r.status]));
  const row = (stage: string) => fake.tables.pm_research_runs.find((r) => r.stage === stage)!;

  beforeEach(() => {
    fake = makeFakeDb({ pm_drops: [drop()], pm_research_runs: [], pm_things: [], profiles: [{ id: "phil", is_instance_owner: true }], pm_people: [] });
    notified.length = 0;
    enqueued.length = 0;
  });

  it("makes a row per stage and runs them in order; all done returns done", async () => {
    const order: string[] = [];
    const log = (name: string): StageFn => async () => (order.push(name), {});
    const r = await runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW, stages: { read: log("read"), resolve: log("resolve"), enrich: log("enrich"), travel: log("travel"), fit: log("fit"), notify: log("notify") } });
    expect(order).toEqual(["read", "resolve", "enrich", "travel", "fit", "notify"]);
    expect(r.done).toBe(true);
    expect(runs()).toEqual({ read: "done", resolve: "done", enrich: "done", travel: "done", fit: "done", notify: "done" });
    expect(row("read").finished_at).toBe(new Date(NOW).toISOString());
  });

  it("a failed read does not stop the rest; it is retried with back-off and the job comes back", async () => {
    await expect(runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW, stages: quiet({ read: boom }) })).rejects.toThrow(/read \(nope\)/);
    expect(runs()).toEqual({ read: "failed", resolve: "done", enrich: "done", travel: "done", fit: "done", notify: "done" });
    expect(row("read")).toMatchObject({ attempts: 1, error: "nope", run_after: new Date(NOW + 2 * MIN).toISOString() });
  });

  it("a failed resolve blocks what depends on it; on the next pass before the back-off nothing runs and the job still comes back", async () => {
    await expect(runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW, stages: quiet({ resolve: boom }) })).rejects.toThrow();
    expect(runs()).toEqual({ read: "done", resolve: "failed", enrich: "queued", travel: "queued", fit: "queued", notify: "queued" });
    // a minute later: not due yet
    await expect(runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW + MIN, stages: quiet({ resolve: boom }) })).rejects.toThrow();
    expect(row("resolve").attempts).toBe(1);
    // three minutes later: due, tried again, fails again, longer wait
    await expect(runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW + 3 * MIN, stages: quiet({ resolve: boom }) })).rejects.toThrow();
    expect(row("resolve")).toMatchObject({ attempts: 2, run_after: new Date(NOW + 3 * MIN + 4 * MIN).toISOString() });
    // then it works, and the dependents run; read is not run again
    const reads: number[] = [];
    const r = await runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW + 10 * MIN, stages: quiet({ read: async () => (reads.push(1), {}) }) });
    expect(reads).toEqual([]);
    expect(r.done).toBe(true);
    expect(runs()).toEqual({ read: "done", resolve: "done", enrich: "done", travel: "done", fit: "done", notify: "done" });
  });

  it("after the last attempt the dependents are skipped with the reason and the job is not brought back", async () => {
    fake.tables.pm_research_runs.push({ id: "r1", space_id: SPACE, drop_id: "drop-1", stage: "resolve", status: "failed", attempts: MAX_STAGE_ATTEMPTS - 1, error: "x", run_after: new Date(NOW - MIN).toISOString(), cost_pence: 0, detail: {} });
    await expect(runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW, stages: quiet({ resolve: boom }) })).resolves.toMatchObject({ done: true });
    expect(runs()).toEqual({ read: "done", resolve: "failed", enrich: "skipped", travel: "skipped", fit: "skipped", notify: "skipped" });
    expect(row("enrich").error).toBe("resolve did not finish: nope");
  });

  it("a waiting resolve (the one question) holds the dependents without failing the job", async () => {
    const waiting: StageFn = async () => ({ status: "waiting", error: "Waiting for an answer" });
    const r = await runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW, stages: quiet({ resolve: waiting }) });
    expect(r).toMatchObject({ done: true, waiting: true });
    expect(runs()).toEqual({ read: "done", resolve: "waiting", enrich: "queued", travel: "queued", fit: "queued", notify: "queued" });
    // the same job again: nothing runs
    const ran: string[] = [];
    await runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW + MIN, stages: quiet({ resolve: async () => (ran.push("resolve"), {}), enrich: async () => (ran.push("enrich"), {}) }) });
    expect(ran).toEqual([]);
  });

  it("force re-runs done stages, and a stage's cost lands on its row", async () => {
    await runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW, stages: quiet({}) });
    const ran: string[] = [];
    const costly: StageFn = async () => (ran.push("enrich"), { cost_pence: 3, provider: "web_search" });
    await runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1", force: true }, { now: NOW + MIN, stages: quiet({ enrich: costly, read: async () => (ran.push("read"), {}) }) });
    expect(ran).toEqual(["read", "enrich"]);
    expect(row("enrich")).toMatchObject({ cost_pence: 3, provider: "web_search" });
  });

  it("a stage may answer skipped, with its reason, and that is final until forced", async () => {
    const skipped: StageFn = async () => ({ status: "skipped", error: NOT_ALLOWED_REASON });
    const r = await runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW, stages: quiet({ enrich: skipped }) });
    expect(r.done).toBe(true);
    expect(row("enrich")).toMatchObject({ status: "skipped", error: NOT_ALLOWED_REASON });
    const status = await researchStatus(fake.client, SPACE, new Date(NOW));
    expect(status).toMatchObject({ queue_depth: 0, stuck: 0, paid_allowed: false, paid_reason: NOT_ALLOWED_REASON });
  });

  it("the status line counts what is queued, retryable and stuck, and the month's spend", async () => {
    await expect(runPipeline(fake.client, { space_id: SPACE, drop_id: "drop-1" }, { now: NOW, stages: quiet({ resolve: boom, read: async () => ({ cost_pence: 2, provider: "vision" }) }) })).rejects.toThrow();
    fake.tables.pm_research_runs.push({ id: "old", space_id: SPACE, drop_id: "drop-9", stage: "read", status: "failed", attempts: MAX_STAGE_ATTEMPTS, run_after: new Date(NOW).toISOString(), cost_pence: 0, detail: {}, updated_at: new Date(NOW).toISOString() });
    fake.tables.pm_people.push({ space_id: SPACE, person_id: "phil", settings: { research_cap_pence: 0 } });
    const s = await researchStatus(fake.client, SPACE, new Date(NOW));
    // resolve failed and retryable, plus the four it blocks
    expect(s.queue_depth).toBe(5);
    expect(s.stuck).toBe(1);
    expect(s.month_cost_pence).toBe(2);
    expect(s.last_ok_by_source.vision).toBe(new Date(NOW).toISOString());
    expect(s.paid_allowed).toBe(true);
  });

  it("answering the question clears it, keeps the name as the person's fact, and re-queues with force", async () => {
    fake.tables.pm_drops[0].question = "What's this place called?";
    fake.tables.pm_drops[0].thing_id = "thing-1";
    fake.tables.pm_things.push({ id: "thing-1", space_id: SPACE, name: "Unknown", status: "needs_answer" });
    fake.tables.pm_research_runs.push({ id: "r1", space_id: SPACE, drop_id: "drop-1", stage: "resolve", status: "waiting", attempts: 0, run_after: new Date(NOW).toISOString(), cost_pence: 0, detail: {} });
    const r = await answerQuestion(fake.client, SPACE, "drop-1", "  Hackfall Woods ");
    expect(r).toEqual({ ok: true });
    expect(fake.tables.pm_drops[0]).toMatchObject({ question: null, answer: "Hackfall Woods" });
    expect(fake.tables.pm_thing_facts).toEqual([expect.objectContaining({ thing_id: "thing-1", key: "name", value: "Hackfall Woods", source_kind: "person", confidence: 1 })]);
    expect(fake.tables.pm_things[0]).toMatchObject({ name: "Hackfall Woods", status: "researching" });
    expect(fake.tables.pm_research_runs[0].status).toBe("queued");
    expect(enqueued).toEqual([{ spaceId: SPACE, dropId: "drop-1", force: true }]);
    expect(await answerQuestion(fake.client, SPACE, "drop-1", "   ")).toMatchObject({ ok: false, status: 400 });
  });
});
