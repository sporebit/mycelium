import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql, localStackEnv } from "./introspect";
import { mintUserJwt } from "@/lib/system/jwt";
import { PHIL_AUTH_UID } from "@/lib/system/identity";

/**
 * Day log Part E — the cross-user case (daylog spec §8, decision 30, flag 3).
 * Through PostgREST on the LOCAL stack, as the policies tests do:
 *   - a linked user (Tess) sees exactly the scenes her person is in, with
 *     the date, and nothing hidden; never a day row, never a fact, never a
 *     transcript; only shareable photos;
 *   - an unlinked teammate sees nothing;
 *   - linking a user who shares no team with Phil is refused by the database.
 * Fails, not skips, when the stack is down.
 */

const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const OUTSIDER = "8f1a2b3c-4d5e-4f6a-9b8c-1d2e3f4a5b6c";
const TEAM = "6d7e8f9a-0b1c-4d2e-9f3a-4b5c6d7e8f9a";
const TEAM_SPACE = "1b2c3d4e-5f6a-4b7c-9d8e-9f0a1b2c3d4e";
const DAY = "2001-06-06";

const env = localStackEnv();
const tokens = new Map<string, string>();
async function token(uid: string): Promise<string> {
  let t = tokens.get(uid);
  if (!t) {
    t = await mintUserJwt({ sub: uid, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
    tokens.set(uid, t);
  }
  return t;
}
async function rest(uid: string, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${env.apiUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: env.anonKey, authorization: `Bearer ${await token(uid)}`, "content-type": "application/json", prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return { status: res.status, body: parsed };
}
const rows = (r: { body: unknown }): Array<Record<string, unknown>> => (Array.isArray(r.body) ? (r.body as Array<Record<string, unknown>>) : []);
const sql = (q: string) => localSql(q);

function seedUser(uid: string, email: string, name: string) {
  sql(
    `set local app.allow_uninvited = 'on'; insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      is_sso_user, is_anonymous)
    values ('00000000-0000-0000-0000-000000000000', '${uid}', 'authenticated', 'authenticated',
      '${email}', extensions.crypt('mycelium-local', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"${name}"}', now(), now(),
      '', '', '', '', '', '', '', '', false, false)
    on conflict (id) do nothing`,
  );
  sql(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), '${uid}', '${uid}', jsonb_build_object('sub', '${uid}', 'email', '${email}', 'email_verified', true), 'email', now(), now(), now())
    on conflict (provider_id, provider) do nothing`,
  );
}

let personId = "";
let dayId = "";
let visibleScene = "";
let hiddenScene = "";
let otherScene = "";

beforeAll(async () => {
  seedUser(TESS, "tess@mycelium.local", "Tess");
  seedUser(OUTSIDER, "outsider@mycelium.local", "Outsider");
  sql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', 'Daylog Link Team', 'daylog-link-team', '${PHIL_AUTH_UID}') on conflict (id) do nothing`);
  sql(`insert into public.spaces (id, kind, team_id) values ('${TEAM_SPACE}', 'team', '${TEAM}') on conflict (id) do nothing`);
  sql(`update public.teams set space_id = '${TEAM_SPACE}' where id = '${TEAM}'`);
  sql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${PHIL_AUTH_UID}', 'owner'), ('${TEAM}', '${TESS}', 'member') on conflict do nothing`);

  sql(`delete from public.daylog_days where day = '${DAY}'`);
  sql(`delete from public.people where first_name = 'daylog-link-test'`);

  // Phil's rows, through PostgREST as Phil
  const person = await rest(PHIL_AUTH_UID, "POST", "people", { first_name: "daylog-link-test" });
  expect(person.status, JSON.stringify(person.body)).toBe(201);
  personId = String(rows(person)[0].id);
  const day = await rest(PHIL_AUTH_UID, "POST", "daylog_days", { day: DAY, status: "closed", summary: "SECRET summary", transcript: [{ role: "user", at: "2001-06-06T20:00:00Z", text: "SECRET transcript", channel: "app" }] });
  expect(day.status, JSON.stringify(day.body)).toBe(201);
  dayId = String(rows(day)[0].id);
  const mk = async (title: string, position: number, hidden = false) => {
    const r = await rest(PHIL_AUTH_UID, "POST", "daylog_scenes", { day_id: dayId, position, title, narrative: `${title} line`, hidden_from_linked: hidden });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return String(rows(r)[0].id);
  };
  visibleScene = await mk("Quayside with Tess", 0);
  hiddenScene = await mk("Hidden from Tess", 1, true);
  otherScene = await mk("Without Tess", 2);
  for (const s of [visibleScene, hiddenScene]) expect((await rest(PHIL_AUTH_UID, "POST", "daylog_scene_people", { scene_id: s, person_id: personId })).status).toBe(201);
  expect((await rest(PHIL_AUTH_UID, "POST", "daylog_facts", { day_id: dayId, scene_id: visibleScene, kind: "person_fact", subject_person_id: personId, text: "SECRET fact about Tess" })).status).toBe(201);
  expect((await rest(PHIL_AUTH_UID, "POST", "daylog_media", { day_id: dayId, scene_id: visibleScene, storage_path: `${dayId}/shared.jpg`, shareable: true })).status).toBe(201);
  expect((await rest(PHIL_AUTH_UID, "POST", "daylog_media", { day_id: dayId, scene_id: visibleScene, storage_path: `${dayId}/private.jpg`, shareable: false })).status).toBe(201);
});

afterAll(() => {
  sql(`delete from public.daylog_days where day = '${DAY}'`);
  sql(`delete from public.people where first_name = 'daylog-link-test'`);
  sql(`delete from public.team_members where team_id = '${TEAM}'`);
  sql(`update public.teams set space_id = null where id = '${TEAM}'`);
  sql(`delete from public.spaces where id = '${TEAM_SPACE}'`);
  sql(`delete from public.teams where id = '${TEAM}'`);
});

describe("linking (flag 3)", () => {
  it("a user who shares no team cannot be linked — the trigger refuses", async () => {
    const r = await rest(PHIL_AUTH_UID, "PATCH", `people?id=eq.${personId}`, { linked_user_id: OUTSIDER });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).toMatch(/share a team/);
  });
  it("before the link, Tess sees nothing", async () => {
    expect(rows(await rest(TESS, "GET", `daylog_scenes?select=id`))).toEqual([]);
    expect(rows(await rest(TESS, "POST", `rpc/daylog_shared_scenes`, { p_from: DAY, p_to: DAY }))).toEqual([]);
  });
  it("a teammate can be linked, and linked_at is stamped", async () => {
    const r = await rest(PHIL_AUTH_UID, "PATCH", `people?id=eq.${personId}&select=linked_user_id,linked_at`, { linked_user_id: TESS });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(rows(r)[0].linked_user_id).toBe(TESS);
    expect(rows(r)[0].linked_at).toBeTruthy();
  });
});

describe("what a linked user sees (decision 30)", () => {
  it("exactly the scenes she is in that are not hidden, through RLS", async () => {
    const ids = rows(await rest(TESS, "GET", `daylog_scenes?select=id`)).map((r) => r.id);
    expect(ids).toEqual([visibleScene]);
  });
  it("the shared-scenes function adds the date, the owner's name and her name — nothing else", async () => {
    const r = rows(await rest(TESS, "POST", `rpc/daylog_shared_scenes`, { p_from: DAY, p_to: DAY }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ scene_id: visibleScene, day: DAY, title: "Quayside with Tess", narrative: "Quayside with Tess line" });
    expect(r[0].participants).toEqual(["daylog-link-test"]);
    expect(JSON.stringify(r[0])).not.toMatch(/SECRET/);
  });
  it("never a day row, a fact, or a private photo", async () => {
    expect(rows(await rest(TESS, "GET", `daylog_days?select=id`))).toEqual([]);
    expect(rows(await rest(TESS, "GET", `daylog_facts?select=id`))).toEqual([]);
    const media = rows(await rest(TESS, "GET", `daylog_media?select=storage_path`)).map((m) => m.storage_path);
    expect(media).toEqual([`${dayId}/shared.jpg`]);
  });
  it("her own membership rows, not the hidden scene's", async () => {
    const links = rows(await rest(TESS, "GET", `daylog_scene_people?select=scene_id`)).map((l) => l.scene_id);
    expect(links).toEqual([visibleScene]);
  });
  it("she cannot write to any of it", async () => {
    const r = await rest(TESS, "PATCH", `daylog_scenes?id=eq.${visibleScene}`, { title: "vandalised" });
    expect(rows(r)).toEqual([]);
    expect(rows(await rest(PHIL_AUTH_UID, "GET", `daylog_scenes?id=eq.${visibleScene}&select=title`))[0].title).toBe("Quayside with Tess");
  });
  it("unlinking takes it all away at once", async () => {
    expect((await rest(PHIL_AUTH_UID, "PATCH", `people?id=eq.${personId}`, { linked_user_id: null })).status).toBe(200);
    expect(rows(await rest(TESS, "GET", `daylog_scenes?select=id`))).toEqual([]);
    expect(rows(await rest(TESS, "POST", `rpc/daylog_shared_scenes`, { p_from: DAY, p_to: DAY }))).toEqual([]);
    expect(otherScene).toBeTruthy();
  });
});
