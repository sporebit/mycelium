/**
 * Three fitness fixes shipped on 2026-10-29, each as Phil and as Tess:
 *
 *   191b6fd  archiving a programme takes effect (Today, the week summary)
 *   fa6a5a2  pain logs outlive the session they were logged in (0153)
 *   77f0840  the rest timer's minimised choice persists
 *
 * Everything is created through the API under `E2E-fixes-1029-<run>` on
 * dates in March 2031 and removed afterwards.
 */
import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";

// The dev server is shared with four other test runs and compiles routes on first visit:
// a slow answer is not a failure, so waits are longer than the suite default.
const expect = baseExpect.configure({ timeout: 90_000 });
test.describe.configure({ timeout: 600_000 });

const RUN = Date.now().toString(36);
// Wednesday of ISO week 10, 2031 (the week's Monday is 3 March)
const WEEK = "2031-W10";
const DAY = "2031-03-05";
const DAY_DOW = 2; // Monday = 0

const ok = async (res: Awaited<ReturnType<APIRequestContext["get"]>>, what: string) => {
  expect(res.status(), `${what}: ${await res.text().catch(() => "")}`).toBeLessThan(300);
  return res.json();
};

test.describe("archiving a programme takes it off the plan", () => {
  let programmeId = "";
  let name = "";
  let sessionName = "";

  test.beforeAll(async ({ request }, testInfo) => {
    name = `E2E-fixes-1029-${RUN}-${testInfo.project.name} programme`;
    sessionName = `${name} Wednesday lift`;
    programmeId = (await ok(await request.post("/api/fitness/programmes", { data: { name } }), "create programme")).programme.id;
    await ok(await request.post(`/api/fitness/programmes/${programmeId}/sessions`, { data: { day_of_week: DAY_DOW, slot: "morning", kind: "resistance", name: sessionName } }), "create template session");
    await ok(await request.post("/api/fitness/phases", { data: { programme_id: programmeId, start_week_iso: WEEK, end_week_iso: WEEK } }), "create phase");
  });

  test.afterAll(async ({ request }) => {
    if (programmeId) await request.delete(`/api/fitness/programmes/${programmeId}`);
  });

  const today = async (request: APIRequestContext) => (await ok(await request.get(`/api/fitness/today?date=${DAY}`), "today")) as { programme_id: string | null; programme_name: string | null; programme_sessions: Array<{ name: string }> };
  const planned = async (request: APIRequestContext) => {
    const week = (await ok(await request.get(`/api/fitness/week-summary?anchor=${DAY}`), "week summary")) as { week_iso: string; days: Array<{ date: string; planned_count: number }> };
    expect(week.week_iso, "the spec's week arithmetic").toBe(WEEK);
    return week.days.find((d) => d.date === DAY)!.planned_count;
  };

  test("live: the programme is the plan for its week", async ({ request, page }) => {
    const t = await today(request);
    expect(t.programme_id).toBe(programmeId);
    expect(t.programme_name).toBe(name);
    expect(t.programme_sessions.map((s) => s.name)).toContain(sessionName);
    expect(await planned(request)).toBe(1);

    await page.goto(`/fitness/${DAY}`);
    await expect(page.getByText(sessionName).first()).toBeVisible({ timeout: 60_000 });
  });

  test("archived from the programmes page: Today and the week summary drop it; unarchiving brings it back", async ({ request, page }) => {
    await page.goto("/fitness/programmes");
    const archive = page.getByRole("button", { name: `Archive ${name}` });
    await archive.hover();
    const archived = page.waitForResponse((r) => r.url().endsWith(`/api/fitness/programmes/${programmeId}/archive`));
    await archive.click();
    expect((await archived).status()).toBe(200);
    await expect(page.getByRole("button", { name: `Archive ${name}` })).toHaveCount(0);

    const t = await today(request);
    expect(t.programme_id, "an archived programme is not the plan").not.toBe(programmeId);
    expect(t.programme_sessions.map((s) => s.name)).not.toContain(sessionName);
    // with no other programme in force that week there is nothing planned at all
    if (t.programme_id === null) expect(await planned(request)).toBe(0);

    const todayLoaded = page.waitForResponse((r) => r.url().includes(`/api/fitness/today?date=${DAY}`) && r.status() === 200);
    await page.goto(`/fitness/${DAY}`);
    await todayLoaded;
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.getByText(sessionName)).toHaveCount(0);

    // the default list hides it; the full list still has it, flagged
    const listed = (await ok(await request.get("/api/fitness/programmes"), "programmes")).programmes as Array<{ id: string }>;
    expect(listed.map((p) => p.id)).not.toContain(programmeId);
    const all = (await ok(await request.get("/api/fitness/programmes?include_archived=true"), "all programmes")).programmes as Array<{ id: string; archived_at: string | null }>;
    expect(all.find((p) => p.id === programmeId)?.archived_at).toBeTruthy();

    await ok(await request.post(`/api/fitness/programmes/${programmeId}/unarchive`), "unarchive");
    expect((await today(request)).programme_id).toBe(programmeId);
    expect(await planned(request)).toBe(1);
  });
});

test.describe("pain logs outlive the session they were logged in (0153)", () => {
  const made: { sessions: string[]; logs: string[] } = { sessions: [], logs: [] };

  test.afterAll(async ({ request }) => {
    for (const id of made.logs) await request.delete(`/api/fitness/pain-logs/${id}`);
    for (const id of made.sessions) await request.delete(`/api/fitness/sessions/${id}`);
  });

  async function sessionWithPain(request: APIRequestContext, label: string) {
    const exercise = `${label} split squat`;
    const sessionId = (await ok(await request.post("/api/fitness/sessions", { data: { slot: "extra", kind: "resistance", name: `${label} session`, date: "2031-03-06" } }), "create session")).session_id as string;
    made.sessions.push(sessionId);
    const exerciseId = (await ok(await request.post(`/api/fitness/sessions/${sessionId}/exercises`, { data: { name: exercise } }), "add exercise")).session_exercise_id as string;
    const onExercise = (await ok(await request.post("/api/fitness/pain-logs", { data: { session_id: sessionId, session_exercise_id: exerciseId, severity: 6, feel_rating: "moderate", pain_regions: ["left_knee"], notes: `${label} exercise note` } }), "exercise pain log")).pain_log;
    const onSession = (await ok(await request.post("/api/fitness/pain-logs", { data: { session_id: sessionId, severity: 3, feel_rating: "mild", notes: `${label} session note` } }), "session pain log")).pain_log;
    made.logs.push(onExercise.id, onSession.id);
    return { sessionId, exerciseId, exercise, onExercise, onSession };
  }

  test("the foreign keys are SET NULL, not cascade", () => {
    const rows = localSql(
      "select conname, confdeltype from pg_constraint where conrelid = 'public.exercise_pain_logs'::regclass and contype = 'f' and conname in ('exercise_pain_logs_session_id_fkey', 'exercise_pain_logs_session_exercise_id_fkey') order by conname",
    );
    expect(rows).toEqual([
      ["exercise_pain_logs_session_exercise_id_fkey", "n"],
      ["exercise_pain_logs_session_id_fkey", "n"],
    ]);
  });

  test("deleting the session keeps both logs, detached, with everything that was written", async ({ request }, testInfo) => {
    const label = `E2E-fixes-1029-${RUN}-${testInfo.project.name}-a`;
    const s = await sessionWithPain(request, label);
    expect((await ok(await request.get(`/api/fitness/sessions/${s.sessionId}/pain-logs`), "session logs")).pain_logs).toHaveLength(2);

    await ok(await request.delete(`/api/fitness/sessions/${s.sessionId}`), "delete session");
    expect((await request.get(`/api/fitness/sessions/${s.sessionId}`)).status()).toBe(404);

    const byExercise = (await ok(await request.get(`/api/fitness/pain-logs?exercise_name=${encodeURIComponent(s.exercise)}`), "logs by exercise")).pain_logs;
    expect(byExercise).toHaveLength(1);
    expect(byExercise[0]).toMatchObject({
      id: s.onExercise.id,
      session_id: null,
      session_exercise_id: null,
      exercise_name: s.exercise,
      severity: 6,
      feel_rating: "moderate",
      pain_regions: ["left_knee"],
      notes: `${label} exercise note`,
      logged_at: s.onExercise.logged_at,
    });

    const sessionLevel = (await ok(await request.get("/api/fitness/pain-logs?exercise_name=session"), "session-level logs")).pain_logs as Array<{ id: string; session_id: string | null; notes: string }>;
    expect(sessionLevel.find((l) => l.id === s.onSession.id)).toMatchObject({ session_id: null, notes: `${label} session note`, severity: 3 });
  });

  test("deleting only the exercise keeps its log against the session", async ({ request }, testInfo) => {
    const label = `E2E-fixes-1029-${RUN}-${testInfo.project.name}-b`;
    const s = await sessionWithPain(request, label);
    await ok(await request.delete(`/api/fitness/sessions/${s.sessionId}/exercises/${s.exerciseId}`), "delete exercise");
    const logs = (await ok(await request.get(`/api/fitness/sessions/${s.sessionId}/pain-logs`), "session logs")).pain_logs as Array<{ id: string; session_exercise_id: string | null; session_id: string | null }>;
    expect(logs.find((l) => l.id === s.onExercise.id)).toMatchObject({ session_id: s.sessionId, session_exercise_id: null });
  });

  test("a surviving session note still shows on the Pain page", async ({ request, page }, testInfo) => {
    const label = `E2E-fixes-1029-${RUN}-${testInfo.project.name}-c`;
    const s = await sessionWithPain(request, label);
    await ok(await request.delete(`/api/fitness/sessions/${s.sessionId}`), "delete session");
    await page.goto("/health/pain");
    await expect(page.getByRole("heading", { name: "Pain tracking" })).toBeVisible();
    await expect(page.getByText(`${label} session note`)).toBeVisible();
  });

  // FINDING (not fixed): a surviving exercise-level log is kept in the database
  // but shown nowhere. /api/fitness/pain-logs/exercise/[name] keeps only logs
  // whose session still exists and is completed (it reads the date from the
  // session), and /health/pain lists only the names "standalone" and
  // "session". 0153's header says "the UI already shows those"; it does not.
  test.fixme("a surviving exercise log still shows in that exercise's pain history", async ({ request }, testInfo) => {
    const label = `E2E-fixes-1029-${RUN}-${testInfo.project.name}-d`;
    const s = await sessionWithPain(request, label);
    await ok(await request.post(`/api/fitness/sessions/${s.sessionId}/finish`, { data: {} }), "finish session");
    const before = (await ok(await request.get(`/api/fitness/pain-logs/exercise/${encodeURIComponent(s.exercise)}`), "history")).logs as Array<{ id: string }>;
    expect(before.map((l) => l.id)).toContain(s.onExercise.id);
    await ok(await request.delete(`/api/fitness/sessions/${s.sessionId}`), "delete session");
    const after = (await ok(await request.get(`/api/fitness/pain-logs/exercise/${encodeURIComponent(s.exercise)}`), "history")).logs as Array<{ id: string }>;
    expect(after.map((l) => l.id)).toContain(s.onExercise.id);
  });
});

test.describe("the rest timer remembers being minimised", () => {
  const sessions: string[] = [];
  const KEY = "mycelium.fitness.rest.minimised";

  test.afterAll(async ({ request }) => {
    for (const id of sessions) await request.delete(`/api/fitness/sessions/${id}`);
  });

  async function newSession(request: APIRequestContext, label: string, date: string) {
    const id = (await ok(await request.post("/api/fitness/sessions", { data: { slot: "extra", kind: "resistance", name: `${label} session`, date } }), "create session")).session_id as string;
    sessions.push(id);
    await ok(await request.post(`/api/fitness/sessions/${id}/exercises`, { data: { name: `${label} press`, rest_seconds: 120 } }), "add exercise");
    return id;
  }

  const overlay = (page: Page) => page.getByRole("dialog", { name: "Rest timer" });
  const bar = (page: Page) => page.getByRole("timer", { name: "Rest timer" });
  const startRest = (page: Page) => page.getByRole("button", { name: "START REST" });
  const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);

  test("minimise once: the next rest, a reload and another session all open in the bottom bar; expanding is remembered too", async ({ request, page }, testInfo) => {
    const label = `E2E-fixes-1029-${RUN}-${testInfo.project.name}-rest`;
    const first = await newSession(request, label, "2031-03-07");
    const second = await newSession(request, `${label}-2`, "2031-03-08");

    await page.goto(`/fitness/log/${first}`);
    expect(await stored(page), "a browser that has never minimised").toBeNull();
    await startRest(page).click({ timeout: 60_000 });
    await expect(overlay(page), "the first rest opens full screen").toBeVisible();
    await expect(overlay(page)).toContainText(`${label} press`);
    await expect(bar(page)).toHaveCount(0);

    await overlay(page).getByRole("button", { name: "Minimise timer" }).click();
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText(/^[01]:\d\d/);
    await expect(overlay(page)).toHaveCount(0);
    expect(await stored(page)).toBe("1");

    // the next rest in the same session
    await bar(page).getByRole("button", { name: "SKIP" }).click();
    await expect(bar(page)).toHaveCount(0);
    await startRest(page).click();
    await expect(bar(page)).toBeVisible();
    await expect(overlay(page)).toHaveCount(0);
    await bar(page).getByRole("button", { name: "SKIP" }).click();

    // after a reload
    await page.reload();
    await startRest(page).click();
    await expect(bar(page)).toBeVisible();
    await expect(overlay(page)).toHaveCount(0);
    await bar(page).getByRole("button", { name: "SKIP" }).click();

    // in another session
    await page.goto(`/fitness/log/${second}`);
    await startRest(page).click();
    await expect(bar(page)).toBeVisible();
    await expect(overlay(page)).toHaveCount(0);

    // expanding is a choice too, and it sticks
    await bar(page).getByRole("button", { name: "Expand timer" }).click();
    await expect(overlay(page)).toBeVisible();
    expect(await stored(page)).toBe("0");
    await overlay(page).getByRole("button", { name: "SKIP" }).click();
    await expect(overlay(page)).toHaveCount(0);
    await page.reload();
    await startRest(page).click();
    await expect(overlay(page)).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
  });
});
