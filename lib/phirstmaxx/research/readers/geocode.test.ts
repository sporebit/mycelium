import { describe, expect, it } from "vitest";
import { googlePlaceDetails, googlePlacesFind, nameSimilarity, nearDuplicate, nominatimReverse, nominatimSearch } from "./geocode";
import type { FetchLike } from "./website";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

describe("nominatimSearch / nominatimReverse", () => {
  it("asks for GB, jsonv2, five, with the Mycelium User-Agent, and maps hits", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const f: FetchLike = async (url, init) => {
      seen.push({ url, init });
      return json([
        { name: "Hackfall", display_name: "Hackfall, Grewelthorpe, North Yorkshire, England", lat: "54.1951", lon: "-1.6512", osm_type: "way", osm_id: 123, category: "leisure", type: "nature_reserve" },
        { display_name: "Hackfall Farm, Ripon", lat: "54.2", lon: "-1.6", osm_type: "node", osm_id: 9, category: "place", type: "farm" },
        { name: "broken", lat: "x", lon: "y" },
      ]);
    };
    const hits = (await nominatimSearch("Hackfall Woods", f))!;
    const u = new URL(seen[0].url);
    expect(u.origin + u.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(u.searchParams.get("format")).toBe("jsonv2");
    expect(u.searchParams.get("countrycodes")).toBe("gb");
    expect(u.searchParams.get("limit")).toBe("5");
    expect(u.searchParams.get("q")).toBe("Hackfall Woods");
    expect((seen[0].init?.headers as Record<string, string>)["User-Agent"]).toBe("Mycelium/1.0 (self-hosted planner)");
    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({ name: "Hackfall", lat: 54.1951, lng: -1.6512, address: "Hackfall, Grewelthorpe, North Yorkshire, England", osm_type: "way", osm_id: 123, kind: "leisure=nature_reserve" });
    expect(hits[1].name).toBe("Hackfall Farm");
  });

  it("is null when Nominatim is down, [] for an empty query, and reverse reads one row", async () => {
    expect(await nominatimSearch("x", async () => json({}, 503))).toBeNull();
    expect(await nominatimSearch("   ", async () => json([]))).toEqual([]);
    const rev = await nominatimReverse(54.0, -1.5, async (url) => {
      expect(url).toContain("/reverse?");
      expect(url).toContain("lat=54&lon=-1.5");
      return json({ name: "Ripon Cathedral", display_name: "Ripon Cathedral, Ripon", lat: "54.1347", lon: "-1.5203", osm_type: "way", osm_id: 5, category: "amenity", type: "place_of_worship" });
    });
    expect(rev?.name).toBe("Ripon Cathedral");
    expect(await nominatimReverse(0, 0, async () => json({ error: "Unable to geocode" }))).toBeNull();
  });
});

const PLACE = {
  id: "ChIJabc",
  displayName: { text: "Brimham Rocks" },
  formattedAddress: "Summerbridge, Harrogate HG3 4DW, UK",
  location: { latitude: 54.0794, longitude: -1.6852 },
  types: ["tourist_attraction", "park"],
  regularOpeningHours: { periods: [{ open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 17, minute: 0 } }] },
  priceLevel: "PRICE_LEVEL_INEXPENSIVE",
  rating: 4.8,
  websiteUri: "https://www.nationaltrust.org.uk/brimham-rocks",
  nationalPhoneNumber: "01423 780688",
  accessibilityOptions: { wheelchairAccessibleEntrance: false },
  allowsDogs: true,
  goodForChildren: true,
  restroom: true,
  parkingOptions: { paidParkingLot: true },
};

describe("Google Places (New)", () => {
  it("searchText sends the key, field mask and bias, and maps facts", async () => {
    let init: RequestInit | undefined;
    const f: FetchLike = async (url, i) => {
      expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
      init = i;
      return json({ places: [PLACE] });
    };
    const p = (await googlePlacesFind("Brimham Rocks", "gkey", f, { lat: 54.1, lng: -1.6 }))!;
    const h = init?.headers as Record<string, string>;
    expect(init?.method).toBe("POST");
    expect(h["X-Goog-Api-Key"]).toBe("gkey");
    expect(h["X-Goog-FieldMask"]).toContain("places.regularOpeningHours");
    expect(h["X-Goog-FieldMask"]).toContain("places.allowsDogs");
    const body = JSON.parse(String(init?.body));
    expect(body.textQuery).toBe("Brimham Rocks");
    expect(body.locationBias.circle.center).toEqual({ latitude: 54.1, longitude: -1.6 });
    expect(p.place_id).toBe("ChIJabc");
    expect(p.lat).toBe(54.0794);
    expect(p.hours?.[6]).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(p.facts.every((x) => x.source_kind === "google_places" && x.confidence === 0.9)).toBe(true);
    const get = (k: string) => p.facts.find((x) => x.key === k)?.value;
    expect(get("dog_rule")).toBe("yes");
    expect(get("toilets")).toBe(true);
    expect(get("wheelchair")).toBe("no");
    expect(get("price_level")).toBe("inexpensive");
    expect(get("parking")).toEqual({ available: true, free: false, paid: true });
  });

  it("details uses the place path with the unprefixed mask; failures are null", async () => {
    const p = await googlePlaceDetails("ChIJabc", "gkey", async (url, init) => {
      expect(url.startsWith("https://places.googleapis.com/v1/places/ChIJabc")).toBe(true);
      expect((init?.headers as Record<string, string>)["X-Goog-FieldMask"].startsWith("id,displayName")).toBe(true);
      return json(PLACE);
    });
    expect(p?.name).toBe("Brimham Rocks");
    expect(await googlePlacesFind("x", "gkey", async () => json({ error: { message: "quota" } }, 429))).toBeNull();
    expect(await googlePlacesFind("x", "gkey", async () => json({}))).toBeNull();
    expect(await googlePlacesFind("x", "", async () => json({ places: [PLACE] }))).toBeNull();
  });
});

describe("nearDuplicate", () => {
  const a = { lat: 54.1951, lng: -1.6512, name: "Hackfall Woods" };
  it("is true within 150 m with a similar name", () => {
    expect(nearDuplicate(a, { lat: 54.1958, lng: -1.6515, name: "Hackfall" })).toBe(true);
    expect(nearDuplicate(a, { lat: 54.1951, lng: -1.651, name: "HACKFALL WOODS!" })).toBe(true);
  });
  it("is false further away or with a different name", () => {
    expect(nearDuplicate(a, { lat: 54.1975, lng: -1.6512, name: "Hackfall Woods" })).toBe(false); // ~270 m
    expect(nearDuplicate(a, { lat: 54.1952, lng: -1.6512, name: "Grewelthorpe Tea Room" })).toBe(false);
  });
  it("normalises names: accents, ampersands, stop words", () => {
    expect(nameSimilarity("The Crown & Anchor", "Crown and Anchor")).toBe(1);
    expect(nameSimilarity("Café Nero", "Cafe Nero")).toBe(1);
    expect(nameSimilarity("The Old Mill", "Mill Cafe")).toBe(0.5);
    expect(nameSimilarity("", "x")).toBe(0);
  });
});
