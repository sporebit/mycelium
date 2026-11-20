#!/usr/bin/env node
/**
 * Proves the access hardening (0160) on the HOSTED database with the test
 * account, which has an authenticator enrolled:
 *
 *   1. password only        → the data API refuses (403, hint mfa_required)
 *   2. password + code      → the data API answers
 *   3. that session ended   → the data API refuses at once (hint session_ended)
 *   4. nobody signed in     → the rate limiter and the lockout functions refuse
 *
 *   node scripts/verify-hardening.mjs
 *
 * Talks to Supabase only. Prints statuses and hints, never a credential or
 * a row. Reads TEST_ACCOUNT_* from .env.local (written by test-account.mjs).
 */
import { readFileSync } from "node:fs";
import { totp } from "./lib/totp.mjs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
for (const k of ["TEST_ACCOUNT_EMAIL", "TEST_ACCOUNT_PASSWORD", "TEST_ACCOUNT_TOTP_SECRET"]) {
  if (!env[k]) throw new Error(`${k} missing from .env.local; run scripts/test-account.mjs first`);
}

const call = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { apikey: ANON, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
};
const hint = (r) => (r.json && typeof r.json === "object" && !Array.isArray(r.json) ? (r.json.hint ?? r.json.code ?? r.json.error_code ?? "") : "");

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};

const signIn = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: env.TEST_ACCOUNT_EMAIL, password: env.TEST_ACCOUNT_PASSWORD } });
if (signIn.status !== 200) throw new Error(`sign-in failed: ${signIn.status} ${hint(signIn)}`);
const aal1 = signIn.json.access_token;

// 1. password only
const r1 = await call("/rest/v1/tickets?select=id&limit=1", { token: aal1 });
check("password alone is refused by the data API", r1.status === 403 && hint(r1) === "mfa_required", `${r1.status} ${hint(r1)}`);
const r1b = await call("/rest/v1/rpc/requires_totp", { method: "POST", token: aal1, body: {} });
check("…but it may still ask whether a code is required", r1b.status === 200, `${r1b.status}`);

// 2. password + code
const me = await call("/auth/v1/user", { token: aal1 });
const factor = (me.json?.factors ?? []).find((f) => f.factor_type === "totp" && f.status === "verified");
if (!factor) throw new Error("the test account has no verified authenticator");
const challenge = await call(`/auth/v1/factors/${factor.id}/challenge`, { method: "POST", token: aal1, body: {} });
const verify = await call(`/auth/v1/factors/${factor.id}/verify`, { method: "POST", token: aal1, body: { challenge_id: challenge.json?.id, code: totp(env.TEST_ACCOUNT_TOTP_SECRET) } });
check("the authenticator code is accepted", verify.status === 200, `${verify.status} ${hint(verify)}`);
const aal2 = verify.json?.access_token;
const r2 = await call("/rest/v1/tickets?select=id&limit=1", { token: aal2 });
check("password + code reads through the data API", r2.status === 200 && Array.isArray(r2.json), `${r2.status} ${hint(r2)}`);
const r2b = await call("/rest/v1/day_plans?select=id&limit=1", { token: aal2 });
check("the new daily-loop tables answer (0161)", r2b.status === 200, `${r2b.status} ${hint(r2b)}`);

// 4. functions that used to trust their caller
const r4 = await call("/rest/v1/rpc/rate_limit_take", { method: "POST", token: aal2, body: { p_key: "verify", p_capacity: 1, p_refill_per_minute: 1, p_cost: 1 } });
check("a signed-in person cannot call the rate limiter", r4.status === 403 || r4.status === 401, `${r4.status} ${hint(r4)}`);
const r4b = await call("/rest/v1/rpc/second_factor_succeeded", { method: "POST", token: aal2, body: { p_user: "00000000-0000-0000-0000-000000000000" } });
check("…or clear a second-factor lockout", r4b.status === 403 || r4b.status === 401, `${r4b.status} ${hint(r4b)}`);
const r4c = await call("/rest/v1/tickets?select=id&limit=1", {});
check("nobody signed in reads nothing", r4c.status >= 400 || (Array.isArray(r4c.json) && r4c.json.length === 0), `${r4c.status}`);

// 3. sign out; the token is still valid by signature, the session is gone
const out = await call("/auth/v1/logout?scope=local", { method: "POST", token: aal2 });
const r3 = await call("/rest/v1/tickets?select=id&limit=1", { token: aal2 });
check("a signed-out session is refused at once", r3.status === 403 && hint(r3) === "session_ended", `logout ${out.status}; then ${r3.status} ${hint(r3)}`);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
