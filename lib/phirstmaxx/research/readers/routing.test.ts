import { describe, expect, it } from "vitest";
import { googleRoute, haversineKm, orsRoute, parseDurationSeconds, routeWithFallback } from "./routing";
import type { FetchLike } from "./website";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const home = { lat: 53.8008, lng: -1.5491 }; // Leeds
const hackfall = { lat: 54.1951, lng: -1.6512 };
const estimate = (km: number) => km * 1.5;

describe("haversineKm / parseDurationSeconds", () => {
  it("measures straight lines and reads Google durations", () => {
    expect(haversineKm(home, hackfall)).toBeGreaterThan(43);
    expect(haversineKm(home, hackfall)).toBeLessThan(45);
    expect(parseDurationSeconds("1234s")).toBe(1234);
    expect(parseDurationSeconds("12.5s")).toBe(12.5);
    expect(parseDurationSeconds("PT5M")).toBeNull();
  });
});

describe("orsRoute", () => {
  it("GETs the profile with the key in a header and reads the summary", async () => {
    const f: FetchLike = async (url, init) => {
      expect(url).toBe("https://api.openrouteservice.org/v2/directions/foot-walking?start=-1.5491,53.8008&end=-1.6512,54.1951");
      expect((init?.headers as Record<string, string>).Authorization).toBe("orskey");
      return json({ features: [{ properties: { summary: { distance: 51234, duration: 37000 } } }] });
    };
    expect(await orsRoute(home, hackfall, "walk", "orskey", f)).toEqual({ minutes: 617, km: 51.2 });
  });
  it("has no transit and is null on failure", async () => {
    const never: FetchLike = async () => {
      throw new Error("should not be called");
    };
    expect(await orsRoute(home, hackfall, "transit", "orskey", never)).toBeNull();
    expect(await orsRoute(home, hackfall, "drive", "orskey", async () => json({ error: "quota" }, 429))).toBeNull();
  });
});

describe("googleRoute", () => {
  const now = Date.UTC(2026, 10, 21, 12);
  it("drives with traffic and a future departure", async () => {
    let body: Record<string, unknown> = {};
    const f: FetchLike = async (url, init) => {
      expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
      const h = init?.headers as Record<string, string>;
      expect(h["X-Goog-FieldMask"]).toBe("routes.duration,routes.distanceMeters");
      expect(h["X-Goog-Api-Key"]).toBe("gkey");
      body = JSON.parse(String(init?.body));
      return json({ routes: [{ duration: "3300s", distanceMeters: 61000 }] });
    };
    const depart = new Date(Date.UTC(2026, 10, 28, 9));
    expect(await googleRoute(home, hackfall, "drive", depart, "gkey", f, now)).toEqual({ minutes: 55, km: 61 });
    expect(body.travelMode).toBe("DRIVE");
    expect(body.routingPreference).toBe("TRAFFIC_AWARE");
    expect(body.departureTime).toBe(depart.toISOString());
  });
  it("omits a past departure and maps walk, cycle and transit", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const f: FetchLike = async (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return json({ routes: [{ duration: "600s" }] });
    };
    expect(await googleRoute(home, hackfall, "drive", new Date(now - 3_600_000), "gkey", f, now)).toEqual({ minutes: 10, km: null });
    expect(bodies[0].departureTime).toBeUndefined();
    await googleRoute(home, hackfall, "walk", null, "gkey", f, now);
    await googleRoute(home, hackfall, "cycle", null, "gkey", f, now);
    await googleRoute(home, hackfall, "transit", new Date(now + 86_400_000), "gkey", f, now);
    expect(bodies.slice(1).map((b) => b.travelMode)).toEqual(["WALK", "BICYCLE", "TRANSIT"]);
    expect(bodies[1].routingPreference).toBeUndefined();
    expect(bodies[3].departureTime).toBeDefined();
  });
  it("is null with no routes", async () => {
    expect(await googleRoute(home, hackfall, "drive", null, "gkey", async () => json({}), now)).toBeNull();
  });
});

describe("routeWithFallback", () => {
  it("uses Google first when keyed", async () => {
    const f: FetchLike = async (url) => (url.includes("routes.googleapis.com") ? json({ routes: [{ duration: "3300s", distanceMeters: 61000 }] }) : json({}, 500));
    expect(await routeWithFallback(home, hackfall, "drive", { googleKey: "g", orsKey: "o", fetch: f, estimate })).toEqual({ minutes: 55, km: 61, provider: "google" });
  });
  it("falls to ORS when Google fails", async () => {
    const f: FetchLike = async (url) => (url.includes("openrouteservice") ? json({ features: [{ properties: { summary: { distance: 60000, duration: 3600 } } }] }) : json({}, 500));
    expect(await routeWithFallback(home, hackfall, "drive", { googleKey: "g", orsKey: "o", fetch: f, estimate })).toEqual({ minutes: 60, km: 60, provider: "ors" });
  });
  it("estimates transit without Google rather than asking ORS", async () => {
    const urls: string[] = [];
    const f: FetchLike = async (url) => {
      urls.push(url);
      return json({}, 500);
    };
    const r = await routeWithFallback(home, hackfall, "transit", { orsKey: "o", fetch: f, estimate });
    expect(urls).toEqual([]);
    expect(r.provider).toBe("estimate");
  });
  it("estimates with both keys missing, from the straight-line distance, and never calls out", async () => {
    const never: FetchLike = async () => {
      throw new Error("should not be called");
    };
    const modes: string[] = [];
    const r = await routeWithFallback(home, hackfall, "cycle", {
      fetch: never,
      estimate: (km, mode) => {
        modes.push(mode);
        return km * 4;
      },
    });
    expect(r.provider).toBe("estimate");
    expect(r.km).toBeCloseTo(haversineKm(home, hackfall), 1);
    expect(r.minutes).toBe(Math.round(haversineKm(home, hackfall) * 4));
    expect(modes).toEqual(["cycle"]);
  });
});
