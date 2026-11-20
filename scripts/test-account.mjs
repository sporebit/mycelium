/**
 * The hosted test account: a second, real user on production that Phil can
 * sign in as to see exactly what another member sees (master run §6).
 *
 *   node scripts/test-account.mjs                 create it if missing, enrol TOTP
 *   node scripts/test-account.mjs --team <uuid>   also join that team as a member
 *   node scripts/test-account.mjs --status        what exists (no changes)
 *   node scripts/test-account.mjs --code          print the current 6-digit code
 *
 * How it goes through the front door:
 *   1. An invite row is written with the service role, in Phil's name,
 *      because sign-up is invite-only and the database refuses any other
 *      new user. (The app's own invite route needs a signed-in person and
 *      refuses the API secret, so it cannot be used from a script.)
 *   2. The user is created with the service role for the invited address,
 *      already confirmed (the address receives no mail).
 *   3. The account signs in with its password and accepts the invite itself.
 *   4. It enrols an authenticator and verifies it once.
 *
 * Direct grants from Phil's personal space are NOT made here: the app asks
 * for Phil's own authenticator code before sharing, and that stays his.
 *
 * Secrets live in .env.local only, under TEST_ACCOUNT_EMAIL,
 * TEST_ACCOUNT_PASSWORD and TEST_ACCOUNT_TOTP_SECRET. Nothing is printed
 * except with --code.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { totp } from "./lib/totp.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const DEFAULT_EMAIL = "mycelium-test@sporebit.com";

function readEnv() {
  const out = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}
function saveEnv(key, value) {
  appendFileSync(ENV_FILE, `\n${key}=${value}`);
}

const env = readEnv();
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE })) {
  if (!v) throw new Error(`${k} is missing from .env.local`);
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}
const admin = { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };

async function findUser(email) {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/find_user_by_email`, { method: "POST", headers: admin, body: JSON.stringify({ p_email: email }) });
  if (res.ok) {
    const body = await json(res);
    const row = Array.isArray(body) ? body[0] : body;
    if (row && (row.id || row.user_id)) return row.id ?? row.user_id;
  }
  // Fall back to the admin listing (one page is plenty for this instance).
  const list = await json(await fetch(`${SUPABASE}/auth/v1/admin/users?per_page=200`, { headers: admin }));
  return (list.users ?? []).find((u) => u.email === email)?.id ?? null;
}

async function createInvite(email, teamId) {
  const owner = await json(await fetch(`${SUPABASE}/rest/v1/profiles?select=id&is_instance_owner=is.true`, { headers: admin }));
  if (!Array.isArray(owner) || !owner[0]?.id) throw new Error("no instance owner found");
  const token = randomBytes(32).toString("hex");
  const res = await fetch(`${SUPABASE}/rest/v1/invites`, {
    method: "POST",
    headers: { ...admin, prefer: "return=minimal" },
    body: JSON.stringify({
      email,
      team_id: teamId,
      role: "member",
      token_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      invited_by: owner[0].id,
    }),
  });
  if (!res.ok) throw new Error(`invite failed: ${res.status} ${(await json(res)).message ?? ""}`);
  return token;
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await json(res);
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${body.error_description ?? body.msg ?? ""}`);
  return body.access_token;
}

async function acceptInvite(accessToken, token) {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/accept_invite`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ p_token: token }),
  });
  if (!res.ok) throw new Error(`accept failed: ${res.status} ${(await json(res)).message ?? ""}`);
}

async function enrolTotp(accessToken) {
  const user = { apikey: ANON, authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
  const enrol = await json(await fetch(`${SUPABASE}/auth/v1/factors`, { method: "POST", headers: user, body: JSON.stringify({ factor_type: "totp", friendly_name: "Test account" }) }));
  if (!enrol.id || !enrol.totp?.secret) throw new Error(`enrol failed: ${enrol.msg ?? enrol.error_description ?? "no factor returned"}`);
  const challenge = await json(await fetch(`${SUPABASE}/auth/v1/factors/${enrol.id}/challenge`, { method: "POST", headers: user, body: "{}" }));
  if (!challenge.id) throw new Error("challenge failed");
  const verify = await fetch(`${SUPABASE}/auth/v1/factors/${enrol.id}/verify`, { method: "POST", headers: user, body: JSON.stringify({ challenge_id: challenge.id, code: totp(enrol.totp.secret) }) });
  if (!verify.ok) throw new Error(`verify failed: ${verify.status}`);
  return enrol.totp.secret;
}

async function memberships(userId) {
  const res = await fetch(`${SUPABASE}/rest/v1/team_members?select=team_id,role,teams(name)&user_id=eq.${userId}`, { headers: admin });
  return res.ok ? await json(res) : [];
}

async function main() {
  const email = env.TEST_ACCOUNT_EMAIL || DEFAULT_EMAIL;

  if (flag("--code")) {
    if (!env.TEST_ACCOUNT_TOTP_SECRET) throw new Error("no TEST_ACCOUNT_TOTP_SECRET in .env.local");
    console.log(totp(env.TEST_ACCOUNT_TOTP_SECRET));
    return;
  }

  let userId = await findUser(email);
  if (flag("--status")) {
    const teams = userId ? await memberships(userId) : [];
    console.log(JSON.stringify({ exists: Boolean(userId), totp: Boolean(env.TEST_ACCOUNT_TOTP_SECRET), teams: teams.map((t) => `${t.teams?.name ?? t.team_id} (${t.role})`) }));
    return;
  }

  const teamId = option("--team");
  let password = env.TEST_ACCOUNT_PASSWORD;

  if (!userId) {
    const token = await createInvite(email, teamId);
    password = randomBytes(18).toString("base64url");
    const res = await fetch(`${SUPABASE}/auth/v1/admin/users`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: "Test account" } }),
    });
    const body = await json(res);
    if (!res.ok) throw new Error(`create user failed: ${res.status} ${body.msg ?? body.error_description ?? ""}`);
    userId = body.id;
    if (!env.TEST_ACCOUNT_EMAIL) saveEnv("TEST_ACCOUNT_EMAIL", email);
    saveEnv("TEST_ACCOUNT_PASSWORD", password);
    const access = await signIn(email, password);
    await acceptInvite(access, token);
    console.log("created and invite accepted");
  } else if (teamId) {
    if (!password) throw new Error("the account exists but TEST_ACCOUNT_PASSWORD is not in .env.local");
    const already = (await memberships(userId)).some((t) => t.team_id === teamId);
    if (already) {
      console.log("already in that team");
    } else {
      const token = await createInvite(email, teamId);
      await acceptInvite(await signIn(email, password), token);
      console.log("joined the team");
    }
  } else {
    console.log("already exists");
  }

  if (!env.TEST_ACCOUNT_TOTP_SECRET) {
    const secret = await enrolTotp(await signIn(email, password));
    saveEnv("TEST_ACCOUNT_TOTP_SECRET", secret);
    console.log("authenticator enrolled");
  }
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
