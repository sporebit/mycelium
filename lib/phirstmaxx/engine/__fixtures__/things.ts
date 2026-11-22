/**
 * A small, well-tagged pool of things for the scoring and chain tests,
 * ported from the old app's ideas fixture. Coordinates are rough North
 * Yorkshire.
 */
import type { EngineThing } from "../score";

export function thing(partial: Partial<EngineThing> & { id: string; name: string }): EngineThing {
  return {
    kind: "other",
    tags: [],
    lat: null,
    lng: null,
    cost_pence: null,
    min_minutes: null,
    dog_rule: "unknown",
    best_time_of_day: [],
    seasons: [],
    stars_by: {},
    ...partial,
  };
}

export const BEACON_WALK = thing({
  id: "beacon",
  name: "Sunset walk at Beacon Hill",
  kind: "walk",
  tags: ["outdoors", "romance", "with-max"],
  lat: 54.5,
  lng: -1.58,
  cost_pence: 0,
  min_minutes: 90,
  dog_rule: "yes",
  best_time_of_day: ["evening"],
});

export const CHIPPY = thing({
  id: "chippy",
  name: "Chippy on the front",
  kind: "food",
  tags: ["food", "coast"],
  lat: 54.502,
  lng: -1.575,
  cost_pence: 1400,
  min_minutes: 45,
  dog_rule: "outside_only",
});

export const ITALIAN = thing({
  id: "italian",
  name: "The Little Italian",
  kind: "food",
  tags: ["food", "date-night"],
  lat: 54.49,
  lng: -1.6,
  cost_pence: 4500,
  min_minutes: 120,
  dog_rule: "no",
  best_time_of_day: ["evening"],
  stars_by: { kirsty: 3 },
});

export const KIELDER = thing({
  id: "kielder",
  name: "Kielder Observatory",
  kind: "night_sky",
  tags: ["night-sky", "outdoors", "big-day-out"],
  lat: 55.23,
  lng: -2.62,
  cost_pence: 2800,
  min_minutes: 120,
  dog_rule: "no",
  best_time_of_day: ["night"],
});

export const SUNDAY_SERVICE = thing({
  id: "service",
  name: "Evening service + walk",
  kind: "faith",
  tags: ["faith", "outdoors"],
  lat: 54.51,
  lng: -1.56,
  cost_pence: 0,
  min_minutes: 75,
  dog_rule: "outside_only",
  best_time_of_day: ["evening"],
});

export const SUMMER_ONLY = thing({
  id: "lido",
  name: "Outdoor lido",
  kind: "other",
  tags: ["outdoors"],
  lat: 54.5,
  lng: -1.59,
  cost_pence: 1200,
  min_minutes: 90,
  dog_rule: "no",
  seasons: ["summer"],
});

export const POOL = [BEACON_WALK, CHIPPY, ITALIAN, KIELDER, SUNDAY_SERVICE, SUMMER_ONLY];
