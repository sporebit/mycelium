import { describe, expect, it } from "vitest";
import { dogRule, indoorFromTags, osmFacts, overpassAround } from "./osm";
import type { FetchLike } from "./website";

type El = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
const FIXTURE: { version: number; elements: El[] } = {
  version: 0.6,
  elements: [
    { type: "way", id: 22, center: { lat: 54.1958, lon: -1.6515 }, tags: { name: "Hackfall", leisure: "nature_reserve", dog: "leashed", fee: "no" } },
    { type: "node", id: 11, lat: 54.1951, lon: -1.6512, tags: { name: "Hackfall car park", amenity: "parking", fee: "no", capacity: "20" } },
    { type: "node", id: 33, lat: 54.1951, lon: -1.6512 },
    { type: "relation", id: 44, center: { lat: 54.21, lon: -1.66 }, tags: { name: "Far thing", tourism: "museum" } },
  ],
};

describe("overpassAround", () => {
  it("POSTs an around query and returns named elements nearest first", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const f: FetchLike = async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify(FIXTURE), { headers: { "content-type": "application/json" } });
    };
    const els = (await overpassAround(54.1951, -1.6512, 400, f))!;
    expect(seen!.url).toBe("https://overpass-api.de/api/interpreter");
    expect(seen!.init?.method).toBe("POST");
    const q = decodeURIComponent(String(seen!.init?.body).replace(/^data=/, ""));
    expect(q).toContain("around:400,54.1951,-1.6512");
    expect(q).toContain("out center tags");
    expect(els.map((e) => e.osm_id)).toEqual([11, 22, 44]);
    expect(els[0]).toMatchObject({ osm_type: "node", name: "Hackfall car park", distance_m: 0 });
    expect(els[1].lat).toBe(54.1958);
  });
  it("is null when Overpass is busy or down", async () => {
    expect(await overpassAround(54, -1, 100, async () => new Response("busy", { status: 429 }))).toBeNull();
    expect(
      await overpassAround(54, -1, 100, async () => {
        throw new Error("offline");
      }),
    ).toBeNull();
  });
});

describe("osmFacts", () => {
  it("maps tags to facts with source osm and a link", () => {
    const facts = osmFacts(
      { name: "Ripon Museum", tourism: "museum", opening_hours: "Mo-Fr 10:00-16:00; Sa-Su 11:00-17:00; PH off", website: "https://riponmuseums.co.uk", phone: "+44 1765 690799", fee: "yes", charge: "£8", dog: "no", wheelchair: "limited", toilets: "yes" },
      { osm_type: "node", osm_id: 7 },
    );
    const get = (k: string) => facts.find((x) => x.key === k)?.value;
    expect(facts.every((x) => x.source_kind === "osm" && x.source_url === "https://www.openstreetmap.org/node/7")).toBe(true);
    expect(facts.find((x) => x.key === "opening_hours")?.confidence).toBe(0.7);
    expect((get("opening_hours") as Record<number, unknown>)[6]).toEqual([{ open: "11:00", close: "17:00" }]);
    expect(get("website")).toBe("https://riponmuseums.co.uk");
    expect(get("telephone")).toBe("+44 1765 690799");
    expect(get("fee")).toBe(true);
    expect(get("charge")).toBe("£8");
    expect(get("dog_rule")).toBe("no");
    expect(get("wheelchair")).toBe("limited");
    expect(get("toilets")).toBe(true);
    expect(get("indoor")).toBe(true);
    expect(get("osm_kind")).toBe("tourism=museum");
  });
  it("keeps unreadable hours as raw text at lower confidence, and reads parking", () => {
    const facts = osmFacts(FIXTURE.elements[1].tags ?? {});
    expect(facts.find((x) => x.key === "parking")?.value).toEqual({ available: true, fee: false, capacity: 20 });
    expect(facts[0].source_url).toBeNull();
    const odd = osmFacts({ opening_hours: "Apr-Oct: Mo-Su 10:00-17:00" });
    expect(odd).toEqual([{ key: "opening_hours_text", value: "Apr-Oct: Mo-Su 10:00-17:00", source_url: null, source_kind: "osm", confidence: 0.4 }]);
  });
  it("reads outdoor places and the dog rule", () => {
    expect(indoorFromTags({ leisure: "park" })).toBe(false);
    expect(indoorFromTags({ natural: "beach" })).toBe(false);
    expect(indoorFromTags({ tourism: "museum" })).toBe(true);
    expect(indoorFromTags({ amenity: "bench" })).toBeNull();
    expect(dogRule("yes")).toBe("yes");
    expect(dogRule("leashed")).toBe("yes");
    expect(dogRule("no")).toBe("no");
    expect(dogRule("outside")).toBe("outside_only");
    expect(dogRule("maybe")).toBe("unknown");
    expect(osmFacts({ leisure: "park" }).find((x) => x.key === "dog_rule")).toBeUndefined();
  });
});
