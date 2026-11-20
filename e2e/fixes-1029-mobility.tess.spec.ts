/**
 * 2026-10-29 fix (0ccb99e): seed-mobility writes `default_hold_seconds`.
 * The seed rows carried the hold time; the insert dropped it, so a seeded
 * "Deep Squat Hold" had no target.
 *
 * Tess only. The route seeds every programme the caller can see, and Phil's
 * local programmes are not this spec's to change; Tess has none of her own,
 * so the one made here is the only one touched (the spec skips itself if it
 * finds another). The programme, its session and the baseline rows the
 * route adds are removed afterwards.
 */
import { expect as baseExpect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { MOBILITY_SEED } from "../lib/fitness/seed-mobility.ts";
import { TESS, personalSpace } from "./support/users.ts";

// The dev server is shared with four other test runs and compiles routes on first visit:
// a slow answer is not a failure, so waits are longer than the suite default.
const expect = baseExpect.configure({ timeout: 90_000 });
test.describe.configure({ timeout: 600_000 });

const RUN = Date.now().toString(36);
const NAME = `E2E-fixes-1029-${RUN} mobility programme`;
// Monday of ISO week 11, 2031
const WEEK = "2031-W11";
const MONDAY = "2031-03-10";

const HOLDS = MOBILITY_SEED.filter((m) => m.data_shape === "hold");

let programmeId = "";
let sessionId = "";
let othersProgrammes = 0;
let baselinesBefore: string[] = [];

const ok = async (res: Awaited<ReturnType<APIRequestContext["get"]>>, what: string) => {
  expect(res.status(), `${what}: ${await res.text().catch(() => "")}`).toBeLessThan(300);
  return res.json();
};

/** Every object named `name` anywhere in a response. */
function named(node: unknown, name: string, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(node)) node.forEach((n) => named(n, name, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.name === name) out.push(o);
    Object.values(o).forEach((v) => named(v, name, out));
  }
  return out;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const all = (await ok(await request.get("/api/fitness/programmes?include_archived=true"), "programmes")).programmes as unknown[];
  othersProgrammes = all.length;
  if (othersProgrammes > 0) return;
  baselinesBefore = localSql(`select id from public.exercise_baselines where space_id = '${personalSpace(TESS)}'`).map((r) => r[0]);
  programmeId = (await ok(await request.post("/api/fitness/programmes", { data: { name: NAME } }), "create programme")).programme.id;
  await ok(await request.post("/api/fitness/phases", { data: { programme_id: programmeId, start_week_iso: WEEK, end_week_iso: WEEK } }), "create phase");
});

test.afterAll(async ({ request }) => {
  if (sessionId) await request.delete(`/api/fitness/sessions/${sessionId}`);
  if (!programmeId) return;
  await request.delete(`/api/fitness/programmes/${programmeId}`);
  const keep = baselinesBefore.length ? `and id not in (${baselinesBefore.map((id) => `'${id}'`).join(",")})` : "";
  const names = MOBILITY_SEED.map((m) => `'${m.name.replace(/'/g, "''")}'`).join(",");
  localSql(`delete from public.exercise_baselines where space_id = '${personalSpace(TESS)}' and exercise_name in (${names}) ${keep}`);
});

test("the seed has hold exercises to check", () => {
  expect(HOLDS.length).toBeGreaterThanOrEqual(2);
  for (const h of HOLDS) expect(h.default_hold_seconds, h.name).toBeGreaterThan(0);
});

test("seeding gives every weekday an evening mobility session whose hold exercises carry their seconds", async ({ request }) => {
  test.skip(othersProgrammes > 0, "Tess has programmes this spec did not create; seeding would change them");
  const seeded = await ok(await request.post("/api/fitness/seed-mobility"), "seed mobility");
  expect(seeded).toMatchObject({ ok: true, programmes_seen: 1, evening_sessions_created: 5, mobility_exercises_inserted: 5 * MOBILITY_SEED.length });

  const rows = localSql(
    `select s.day_of_week, e.position, e.name, e.data_shape, coalesce(e.default_hold_seconds::text, ''), coalesce(e.default_sets::text, ''), coalesce(e.default_duration_min::text, '')
       from public.workout_programme_exercises e
       join public.workout_programme_sessions s on s.id = e.programme_session_id
      where s.programme_id = '${programmeId}' and s.slot = 'evening'
      order by s.day_of_week, e.position`,
  );
  expect(rows).toHaveLength(5 * MOBILITY_SEED.length);
  const text = (v: number | null) => (v === null ? "" : String(v));
  for (let dow = 0; dow < 5; dow++) {
    const day = rows.filter((r) => Number(r[0]) === dow);
    expect(day.map((r) => [r[2], r[3], r[4], r[5], r[6]]), `weekday ${dow}`).toEqual(
      MOBILITY_SEED.map((m) => [m.name, m.data_shape, text(m.default_hold_seconds), text(m.default_sets), text(m.default_duration_min)]),
    );
  }

  // seeding again changes nothing
  const again = await ok(await request.post("/api/fitness/seed-mobility"), "seed mobility again");
  expect(again).toMatchObject({ evening_sessions_created: 0, mobility_exercises_inserted: 0, baselines_created: 0 });
});

test("the hold seconds reach Today's plan", async ({ request, page }) => {
  test.skip(othersProgrammes > 0, "Tess has programmes this spec did not create");
  const today = await ok(await request.get(`/api/fitness/today?date=${MONDAY}`), "today");
  expect(today.programme_id).toBe(programmeId);
  for (const h of HOLDS) {
    const found = named(today, h.name);
    expect(found.length, `${h.name} in Today's plan`).toBeGreaterThan(0);
    for (const ex of found) expect(ex.default_hold_seconds, h.name).toBe(h.default_hold_seconds);
  }

  // The card lists the first five exercises of the session; a hold among them reads as seconds × sets
  const shown = MOBILITY_SEED.slice(0, 5).filter((m) => m.data_shape === "hold");
  expect(shown.length, "a hold exercise among the first five").toBeGreaterThan(0);
  await page.goto(`/fitness/${MONDAY}`);
  for (const h of shown) {
    const item = page.getByRole("listitem").filter({ hasText: h.name });
    await expect(item.first()).toContainText(`${h.default_hold_seconds}s × ${h.default_sets ?? 1}`, { timeout: 60_000 });
  }
});

test("a session started from the seeded template shows the hold seconds as the target in the logger", async ({ request, page }) => {
  test.skip(othersProgrammes > 0, "Tess has programmes this spec did not create");
  const programme = (await ok(await request.get(`/api/fitness/programmes/${programmeId}`), "programme")).programme as { sessions: Array<{ id: string; day_of_week: number; slot: string }> };
  const monday = programme.sessions.find((s) => s.day_of_week === 0 && s.slot === "evening")!;
  sessionId = (await ok(await request.post("/api/fitness/sessions", { data: { programme_session_id: monday.id, slot: "evening", kind: "mobility", date: MONDAY } }), "start session")).session_id;

  const detail = (await ok(await request.get(`/api/fitness/sessions/${sessionId}`), "session detail")).session as { exercises: Array<{ name: string; data_shape: string; template: { default_hold_seconds: number | null } | null }> };
  expect(detail.exercises.map((e) => e.name)).toEqual(MOBILITY_SEED.map((m) => m.name));
  for (const h of HOLDS) {
    const ex = detail.exercises.find((e) => e.name === h.name)!;
    expect(ex.data_shape).toBe("hold");
    expect(ex.template?.default_hold_seconds, h.name).toBe(h.default_hold_seconds);
  }

  await page.goto(`/fitness/log/${sessionId}`);
  await expect(page.getByText(HOLDS[0].name).first()).toBeVisible({ timeout: 60_000 });
});
