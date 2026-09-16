import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql, localStackEnv } from "@/lib/access/introspect";
import { PHIL_AUTH_UID } from "@/lib/system/identity";

/**
 * VERIFY 6 (P12 Part 6): two recipients on one team with different section
 * toggles get different issues; a member without a section never sees its
 * items; an opted-out user receives nothing. Rendering runs under
 * withUser(recipient) exactly as the cron does. The in-app page's 404 for
 * non-members is checked by the Part 6 HTTP driver.
 */

const env = localStackEnv();
process.env.NEXT_PUBLIC_SUPABASE_URL = env.apiUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
process.env.SUPABASE_JWT_SECRET = env.jwtSecret;

const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const VIC = "9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e";
const SLUG = "verify-six";
const sql = (q: string) => localSql(q);

function ensureUser(id: string, email: string, name: string) {
  sql(
    `set local app.allow_uninvited = 'on'; insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
	    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
	    confirmation_token, recovery_token, email_change_token_new, email_change,
	    email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
	  values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}',
	    extensions.crypt('mycelium-local', extensions.gen_salt('bf')), now(),
	    '{"provider":"email","providers":["email"]}', '{"display_name":"${name}"}', now(), now(), '', '', '', '', '', '', '', '', false, false)
	  on conflict (id) do nothing`,
  );
}

let teamId = "";
let teamSpace = "";

function cleanup() {
  const t = sql(`select id from public.teams where slug = '${SLUG}'`)[0]?.[0];
  if (t) {
    sql(`delete from public.rundown_issues where team_id = '${t}'`);
    sql(`delete from public.rundown_subscriptions where team_id = '${t}'`);
    sql(`delete from public.rundown_settings where team_id = '${t}'`);
    sql(`delete from public.tickets where space_id = (select space_id from public.teams where id = '${t}')`);
    sql(`delete from public.workouts where space_id = (select space_id from public.teams where id = '${t}')`);
    sql(`delete from public.team_member_sections where team_id = '${t}'`);
    sql(`delete from public.team_members where team_id = '${t}'`);
    sql(`update public.teams set space_id = null where id = '${t}'`);
    sql(`delete from public.spaces where team_id = '${t}'`);
    sql(`delete from public.teams where id = '${t}'`);
  }
}

beforeAll(() => {
  ensureUser(TESS, "tess@mycelium.local", "Tess");
  ensureUser(VIC, "vic@mycelium.local", "Vic");
  cleanup();
  // Team owned by Phil with a space, Tess admin, Vic member without organisation.
  teamId = sql(`insert into public.teams (name, slug, owner_user_id) values ('Verify Six', '${SLUG}', '${PHIL_AUTH_UID}') returning id`)[0][0];
  teamSpace = sql(`insert into public.spaces (kind, team_id) values ('team', '${teamId}') returning id`)[0][0];
  sql(`update public.teams set space_id = '${teamSpace}' where id = '${teamId}'`);
  sql(`insert into public.team_members (team_id, user_id, role) values ('${teamId}', '${PHIL_AUTH_UID}', 'owner'), ('${teamId}', '${TESS}', 'admin'), ('${teamId}', '${VIC}', 'member')`);
  sql(`insert into public.team_member_sections (team_id, user_id, section, can_view, can_edit, can_create_delete, can_share) values ('${teamId}', '${VIC}', 'organisation', false, false, false, false)`);
  sql(`insert into public.rundown_settings (team_id, enabled, content, sections) values ('${teamId}', true, '{"changed": true, "upcoming": true, "stats": true, "per_person": true}', array['organisation', 'fitness'])`);
  sql(`insert into public.rundown_subscriptions (user_id, team_id, channels, opted_out) values ('${VIC}', '${teamId}', array['in_app'], false), ('${TESS}', '${teamId}', array['in_app'], false), ('${PHIL_AUTH_UID}', '${teamId}', array['in_app'], true)`);
  // Content in the team space: a task (organisation) and a workout (fitness), both this week.
  sql(`insert into public.tickets (title, space_id, created_by, updated_at) values ('v6: plan the retreat', '${teamSpace}', '${PHIL_AUTH_UID}', now())`);
  sql(`insert into public.workouts (name, space_id, created_by, updated_at) values ('v6: hill sprints', '${teamSpace}', '${TESS}', now())`);
});

afterAll(() => cleanup());

describe("rundowns are rendered per recipient", () => {
  it("two recipients with different section toggles get different issues; an opted-out user gets nothing", async () => {
    const { runRundowns } = await import("@/lib/system/rundowns");
    const report = await runRundowns({ force: true, teamId, origin: "http://localhost:3000" });
    expect(report.errors, report.errors.join(" | ")).toEqual([]);
    expect(report.rendered, JSON.stringify(report)).toBe(2);
    expect(report.skipped.optedOut).toBe(1);

    // localSql splits on newlines: flatten the text to one line per row.
    const issues = sql(`select user_id, regexp_replace(rendered_text, E'[\n\r\t]+', ' ', 'g') from public.rundown_issues where team_id = '${teamId}' and channel = 'in_app'`);
    const byUser = new Map(issues.map(([u, t]) => [u, t]));
    expect(byUser.size).toBe(2);
    expect(byUser.has(PHIL_AUTH_UID)).toBe(false);

    const tess = byUser.get(TESS) ?? "";
    const vic = byUser.get(VIC) ?? "";
    expect(tess).toContain("plan the retreat");
    expect(tess).toContain("hill sprints");
    expect(tess).toContain("ORGANISATION");
    // Vic has organisation toggled off: no task, no organisation heading; fitness still there.
    expect(vic).not.toContain("plan the retreat");
    expect(vic).not.toContain("ORGANISATION");
    expect(vic).toContain("hill sprints");
    expect(tess).not.toBe(vic);
    // per_person names the contributor (Phil) in Tess's copy.
    expect(tess).toMatch(/By:? .*Phil/);
  });

  it("is idempotent for the week and a second run sends nothing new", async () => {
    const { runRundowns } = await import("@/lib/system/rundowns");
    const again = await runRundowns({ force: true, teamId, origin: "http://localhost:3000" });
    expect(again.rendered).toBe(0);
    expect(again.skipped.alreadySent).toBe(2);
    expect(Number(sql(`select count(*) from public.rundown_issues where team_id = '${teamId}'`)[0][0])).toBe(2);
  });

  it("a rundown with a section the recipient cannot see does not leak its items through stats either", () => {
    const vic = sql(`select regexp_replace(rendered_text, E'[\n\r\t]+', ' ', 'g') from public.rundown_issues where team_id = '${teamId}' and user_id = '${VIC}'`)[0][0];
    expect(vic).not.toMatch(/tickets/i);
  });
});
