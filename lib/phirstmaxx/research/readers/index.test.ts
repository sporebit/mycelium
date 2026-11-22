import { describe, expect, it } from "vitest";
import * as readers from "./index";
import type { Fact } from "./index";

describe("readers index", () => {
  it("re-exports every reader", () => {
    for (const name of [
      "fromSchemaOrg", "fromOsm", "fromGooglePlaces", "isOpenAt", "isOpenFor",
      "readWebsite", "parseYouTubeId", "readYouTube", "classifySocial", "readSocial", "parseExif",
      "nominatimSearch", "nominatimReverse", "googlePlacesFind", "googlePlaceDetails", "nearDuplicate",
      "overpassAround", "osmFacts", "orsRoute", "googleRoute", "routeWithFallback", "haversineKm",
    ]) {
      expect(typeof (readers as Record<string, unknown>)[name], name).toBe("function");
    }
  });
  it("Fact carries source and confidence", () => {
    const f: Fact = { key: "name", value: "Hackfall", source_url: null, source_kind: "osm", confidence: 0.7 };
    expect(readers.osmFacts({ name: "Hackfall" })).toEqual([f]);
  });
});
