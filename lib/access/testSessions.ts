/**
 * Real sign-ins against the LOCAL Supabase stack, for tests and the
 * end-to-end harness. Node-only: never import from app code.
 *
 * Since 0160 an account that must have an authenticator (the instance owner,
 * a team owner or admin) can read nothing until it has enrolled one and
 * presented the code in the session. The seeded local Phil is the instance
 * owner, so a password alone is no longer a usable session for him:
 * `secondFactorSession()` enrols an authenticator for the account if it has
 * none, answers the challenge, and returns the upgraded (aal2) session, the
 * same thing a person does at sign-in.
 *
 * The authenticator's secret is kept beside the saved sessions in
 * e2e/.auth (git-ignored). If that file is lost the factor is removed with
 * SQL and enrolled again: this is a local test account, and nothing here
 * can reach the hosted project.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { totp } from "../../scripts/lib/totp.mjs";
import { localSql, localStackEnv } from "./introspect.ts";

export type Session = { access_token: string; refresh_token: string };

const SECRETS_DIR = path.resolve(process.cwd(), "e2e/.auth");
const secretFile = (userId: string) => path.join(SECRETS_DIR, `totp-${userId}.txt`);

async function gotrue(pathname: string, body: unknown, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const env = localStackEnv();
  const res = await fetch(`${env.apiUrl}/auth/v1${pathname}`, {
    method: "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

/** Email and password only: an aal1 session. */
export async function passwordSession(email: string, password: string): Promise<Session> {
  const r = await gotrue("/token?grant_type=password", { email, password });
  if (r.status !== 200 || typeof r.json.access_token !== "string") throw new Error(`password sign-in failed for ${email}: ${r.status}`);
  return { access_token: r.json.access_token, refresh_token: String(r.json.refresh_token) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function verify(session: Session, factorId: string, secret: string): Promise<Session | null> {
  // A code is good for thirty seconds and GoTrue may refuse one it has just
  // seen, so a refusal is retried once in the next window.
  for (let attempt = 0; attempt < 2; attempt++) {
    const challenge = await gotrue(`/factors/${factorId}/challenge`, {}, session.access_token);
    if (challenge.status !== 200) return null;
    const done = await gotrue(`/factors/${factorId}/verify`, { challenge_id: challenge.json.id, code: totp(secret) }, session.access_token);
    if (done.status === 200 && typeof done.json.access_token === "string") {
      return { access_token: done.json.access_token, refresh_token: String(done.json.refresh_token) };
    }
    if (attempt === 0) await sleep(30_500 - (Date.now() % 30_000));
  }
  return null;
}

/** Password, then the authenticator code: an aal2 session. Enrols the account's authenticator on first use. */
export async function secondFactorSession(email: string, password: string, userId: string): Promise<Session> {
  const first = await passwordSession(email, password);
  const file = secretFile(userId);
  const known = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
  const factor = localSql(`select id from auth.mfa_factors where user_id = '${userId}' and status = 'verified' and factor_type = 'totp' order by created_at limit 1`)[0]?.[0];

  if (factor && known) {
    const upgraded = await verify(first, factor, known);
    if (upgraded) return upgraded;
  }

  // No factor, or one whose secret we no longer hold: start again.
  localSql(`delete from auth.mfa_factors where user_id = '${userId}'`);
  const fresh = await passwordSession(email, password);
  const enrol = await gotrue("/factors", { factor_type: "totp", friendly_name: "local tests" }, fresh.access_token);
  const id = enrol.json.id as string | undefined;
  const secret = (enrol.json.totp as { secret?: string } | undefined)?.secret;
  if (!id || !secret) throw new Error(`authenticator enrol failed for ${email}: ${enrol.status}`);
  mkdirSync(SECRETS_DIR, { recursive: true });
  writeFileSync(file, secret);
  const upgraded = await verify(fresh, id, secret);
  if (!upgraded) throw new Error(`authenticator verify failed for ${email}`);
  return upgraded;
}

/** The current code for an account enrolled by secondFactorSession(), for a test that types it into the page. */
export function currentCode(userId: string): string {
  const file = secretFile(userId);
  if (!existsSync(file)) throw new Error("no authenticator has been enrolled for this account by the test harness");
  return totp(readFileSync(file, "utf8").trim());
}
