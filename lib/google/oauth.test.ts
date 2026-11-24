import { describe, expect, it } from "vitest";
import { STATES_KEPT, accountAllowed, allowedAccounts, connectedAccountEmail, decideCallback, isRouterFetch, newState, packStates, revokeToken, settingsReturn, stateAccepted, stateMatches, unpackStates } from "./oauth";

describe("the Google sign-in lock (family calendar spec §4.5)", () => {
  it("states are long, random and only match themselves", () => {
    const a = newState();
    const b = newState();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(stateMatches(a, a)).toBe(true);
    expect(stateMatches(a, b)).toBe(false);
    expect(stateMatches(null, a)).toBe(false);
    expect(stateMatches(a, null)).toBe(false);
    expect(stateMatches("", "")).toBe(false);
  });

  it("reads the allowlist however it is spaced or cased", () => {
    expect(allowedAccounts("Phil@Example.com, other@example.com ;third@example.com")).toEqual(["phil@example.com", "other@example.com", "third@example.com"]);
    expect(allowedAccounts(undefined)).toEqual([]);
    expect(allowedAccounts("")).toEqual([]);
  });

  it("an empty allowlist refuses everyone: the lock is on by default", () => {
    expect(accountAllowed("phil@example.com", [])).toBe(false);
    expect(accountAllowed("PHIL@example.com", ["phil@example.com"])).toBe(true);
    expect(accountAllowed("kirsty@example.com", ["phil@example.com"])).toBe(false);
    expect(accountAllowed(null, ["phil@example.com"])).toBe(false);
  });

  it("decides the callback: state first, then the account", () => {
    const allowed = ["phil@example.com"];
    const a = newState();
    const b = newState();
    expect(decideCallback({ sentState: a, storedState: b, email: "phil@example.com", allowed })).toEqual({ ok: false, reason: "state" });
    expect(decideCallback({ sentState: a, storedState: a, email: null, allowed })).toEqual({ ok: false, reason: "no_account" });
    expect(decideCallback({ sentState: a, storedState: a, email: "kirsty@example.com", allowed })).toEqual({ ok: false, reason: "not_allowed" });
    expect(decideCallback({ sentState: a, storedState: a, email: "Phil@Example.com", allowed })).toEqual({ ok: true, email: "phil@example.com" });
    // The cookie may hold several nonces (a second click, a second tab): any of them is this browser's.
    expect(decideCallback({ sentState: a, storedState: packStates(a, b), email: "Phil@Example.com", allowed })).toEqual({ ok: true, email: "phil@example.com" });
  });

  it("the cookie keeps the last few nonces, newest first, and only well-formed ones count", () => {
    const states = Array.from({ length: STATES_KEPT + 2 }, () => newState());
    let jar = "";
    for (const s of states) jar = packStates(jar, s);
    const kept = unpackStates(jar);
    expect(kept).toHaveLength(STATES_KEPT);
    expect(kept[0]).toBe(states[states.length - 1]);
    expect(stateAccepted(states[states.length - 1], jar)).toBe(true);
    expect(stateAccepted(states[0], jar)).toBe(false);
    expect(packStates(jar, kept[1]).split(".")[0]).toBe(kept[1]); // a repeat moves to the front, not duplicated
    expect(unpackStates("short.a b.;drop")).toEqual([]);
    expect(unpackStates(undefined)).toEqual([]);
    expect(stateAccepted(null, jar)).toBe(false);
    expect(stateAccepted(states[0], "")).toBe(false);
  });

  it("knows a request the Next router made by itself from a person arriving", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(isRouterFetch(h({ "next-router-prefetch": "1", rsc: "1" }))).toBe(true);
    expect(isRouterFetch(h({ rsc: "1" }))).toBe(true);
    expect(isRouterFetch(h({ purpose: "prefetch" }))).toBe(true);
    expect(isRouterFetch(h({ "sec-purpose": "prefetch;anonymous-client-ip" }))).toBe(true);
    expect(isRouterFetch(h({ accept: "text/html" }))).toBe(false);
    expect(settingsReturn("bad_state")).toBe("/other/settings?tab=integrations&google=bad_state");
  });

  it("asks Google which account consented, and gives a token back", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/calendars/primary")) return new Response(JSON.stringify({ id: "Phil@Example.com" }), { status: 200 });
      return new Response("", { status: 200 });
    }) as typeof fetch;
    expect(await connectedAccountEmail("tok", fetchFn)).toBe("phil@example.com");
    expect(await revokeToken("tok", fetchFn)).toBe(true);
    expect(calls[0].url).toContain("calendars/primary");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(calls[1].url).toContain("oauth2.googleapis.com/revoke");
    expect(String(calls[1].init?.body)).toContain("token=tok");
  });

  it("a Google that will not answer means no account, not a crash", async () => {
    const fetchFn = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    expect(await connectedAccountEmail("tok", fetchFn)).toBeNull();
  });
});

describe("settingsReturn with a refused account", () => {
  it("names the address only when given one, URL-encoded", () => {
    expect(settingsReturn("not_allowed", "Kirsty+K@example.com")).toBe("/other/settings?tab=integrations&google=not_allowed&account=Kirsty%2BK%40example.com");
    expect(settingsReturn("not_allowed", null)).toBe("/other/settings?tab=integrations&google=not_allowed");
    expect(settingsReturn("connected")).toBe("/other/settings?tab=integrations&google=connected");
  });
});
