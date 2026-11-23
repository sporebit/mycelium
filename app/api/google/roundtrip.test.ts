/**
 * The Google sign-in, auth → callback, with the state cookie carried between
 * the two as a browser would (family calendar spec §4.5; the bad_state
 * reconnect of 2026-11-23). Google and the database are doubles; the two
 * route handlers are the real ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/user", () => ({ createUserClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/settings/userSettingsRow", () => ({ updateUserSettings: vi.fn(async () => ({ id: "row" })) }));

import { updateUserSettings } from "@/lib/settings/userSettingsRow";
import { STATES_KEPT } from "@/lib/google/oauth";
import { GET as authGet } from "./auth/route";
import { GET as callbackGet } from "./callback/route";

const ORIGIN = "https://mycelium.example.test";
const PHIL = "phil@example.test";

type Started = { state: string; cookie: string; location: URL };

/** A person pressing CONNECT: the redirect to Google, and the cookie the browser keeps. `jar` is what the browser already holds. */
async function start(jar?: string, headers: Record<string, string> = {}): Promise<Started> {
  const req = new NextRequest(`${ORIGIN}/api/google/auth`, { headers: { ...(jar ? { cookie: `mycelium_google_state=${jar}` } : {}), ...headers } });
  const res = await authGet(req);
  expect(res.status).toBe(307);
  const location = new URL(res.headers.get("location")!);
  const setCookie = res.headers.get("set-cookie")!;
  const m = /mycelium_google_state=([^;]*)/.exec(setCookie);
  return { state: location.searchParams.get("state")!, cookie: m![1], location };
}

/** Google sending the person back, with whatever cookie the browser holds. */
async function finish(state: string | null, jar: string | null, code = "the-code"): Promise<{ flag: string; cleared: boolean }> {
  const url = new URL(`${ORIGIN}/api/google/callback`);
  if (state !== null) url.searchParams.set("state", state);
  url.searchParams.set("code", code);
  const req = new NextRequest(url, { headers: jar ? { cookie: `mycelium_google_state=${jar}` } : {} });
  const res = await callbackGet(req);
  expect(res.status).toBe(307);
  const back = new URL(res.headers.get("location")!);
  expect(back.pathname).toBe("/other/settings");
  expect(back.searchParams.get("tab")).toBe("integrations");
  // Two clears: the cookie's path and the path it had before 2026-11-23.
  const clears = res.headers.getSetCookie().filter((c) => /^mycelium_google_state=;/.test(c) && /Max-Age=0/i.test(c));
  const paths = clears.map((c) => /Path=([^;]+)/i.exec(c)?.[1]).sort();
  return { flag: back.searchParams.get("google")!, cleared: paths.join(" ") === "/api/google /api/google/callback" };
}

const googleCalls: string[] = [];
const fetchDouble = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  googleCalls.push(url);
  if (url.startsWith("https://oauth2.googleapis.com/token")) {
    const body = String(init?.body);
    expect(body).toContain(`redirect_uri=${encodeURIComponent(`${ORIGIN}/api/google/callback`)}`);
    return new Response(JSON.stringify({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }), { status: 200 });
  }
  if (url.includes("/calendars/primary")) return new Response(JSON.stringify({ id: PHIL }), { status: 200 });
  if (url.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("", { status: 200 });
  throw new Error(`unexpected fetch ${url}`);
});

describe("Google sign-in round trip", () => {
  beforeEach(() => {
    googleCalls.length = 0;
    vi.mocked(updateUserSettings).mockClear();
    vi.stubGlobal("fetch", fetchDouble);
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_ALLOWED_ACCOUNTS", PHIL);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("the cookie the auth route sets reaches the callback: Secure, HttpOnly, Lax, ten minutes, on the callback's path", async () => {
    const req = new NextRequest(`${ORIGIN}/api/google/auth`);
    const res = await authGet(req);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^mycelium_google_state=[A-Za-z0-9_-]{32,};/);
    expect(setCookie).toMatch(/Path=\/api\/google(;|$)/i);
    expect(setCookie).toMatch(/Max-Age=600/i);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/google/callback`);
  });

  it("start, consent, back: the token is exchanged, the account checked and stored, the person lands on Integrations as connected", async () => {
    const s = await start();
    expect(s.cookie).toBe(s.state);
    const r = await finish(s.state, s.cookie);
    expect(r.flag).toBe("connected");
    expect(r.cleared).toBe(true);
    expect(googleCalls.some((u) => u.includes("/calendars/primary"))).toBe(true);
    expect(vi.mocked(updateUserSettings)).toHaveBeenCalledTimes(1);
    const stored = vi.mocked(updateUserSettings).mock.calls[0][1] as Record<string, unknown>;
    expect(stored.google_account_email).toBe(PHIL);
    expect(stored.google_refresh_token).toBe("ref");
    expect(stored.google_sync_error).toBeNull();
  });

  it("a second start before the first finishes keeps both nonces: either sign-in may complete", async () => {
    const first = await start();
    const second = await start(first.cookie);
    expect(second.cookie.split(".")).toEqual([second.state, first.state]);
    expect((await finish(first.state, second.cookie)).flag).toBe("connected");
    expect((await finish(second.state, second.cookie)).flag).toBe("connected");
    // Only the last few are kept.
    let jar = second.cookie;
    for (let i = 0; i < STATES_KEPT + 1; i++) jar = (await start(jar)).cookie;
    expect(jar.split(".")).toHaveLength(STATES_KEPT);
    expect((await finish(first.state, jar)).flag).toBe("bad_state");
  });

  it("the router's own requests (prefetch, RSC) get 204 and no cookie, so they cannot replace a nonce in flight", async () => {
    const variants: Record<string, string>[] = [{ "next-router-prefetch": "1", rsc: "1" }, { rsc: "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;anonymous-client-ip" }];
    for (const headers of variants) {
      const res = await authGet(new NextRequest(`${ORIGIN}/api/google/auth`, { headers }));
      expect(res.status, JSON.stringify(headers)).toBe(204);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("no cookie, a different nonce, or no state at all: refused before the code is spent", async () => {
    const s = await start();
    expect((await finish(s.state, null)).flag).toBe("bad_state");
    expect((await finish("x".repeat(32), s.cookie)).flag).toBe("bad_state");
    expect((await finish(null, s.cookie)).flag).toBe("bad_state");
    expect(googleCalls).toEqual([]);
    expect(vi.mocked(updateUserSettings)).not.toHaveBeenCalled();
  });

  it("an account outside the allowlist: the token is revoked and nothing stored; an empty allowlist refuses everyone", async () => {
    vi.stubEnv("GOOGLE_ALLOWED_ACCOUNTS", "someone-else@example.test");
    const s = await start();
    expect((await finish(s.state, s.cookie)).flag).toBe("not_allowed");
    expect(googleCalls.some((u) => u.includes("/revoke"))).toBe(true);
    expect(vi.mocked(updateUserSettings)).not.toHaveBeenCalled();

    vi.stubEnv("GOOGLE_ALLOWED_ACCOUNTS", "");
    const t = await start();
    expect((await finish(t.state, t.cookie)).flag).toBe("not_allowed");
  });

  it("Google saying no, or a missing secret, come back as their own words", async () => {
    const s = await start();
    const denied = await callbackGet(new NextRequest(`${ORIGIN}/api/google/callback?error=access_denied&state=${s.state}`, { headers: { cookie: `mycelium_google_state=${s.cookie}` } }));
    expect(new URL(denied.headers.get("location")!).searchParams.get("google")).toBe("denied");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect((await finish(s.state, s.cookie)).flag).toBe("config_error");
  });
});
