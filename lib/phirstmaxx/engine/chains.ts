/**
 * PhirstMaxx engine — chains: two things close enough to do back to back,
 * within a 15-minute hop. Pairs only (old decision 2026-09-02): three-thing
 * chains are rarely wanted and the candidate count explodes. A meal after a
 * walk reads better than a walk after a meal, so pairs are ordered that way.
 */
import type { EngineThing } from "./score";
import { distanceKm, estimateLegMinutes } from "./travel";

export type Chain = { things: [EngineThing, EngineThing]; hopMinutes: number };

const ACTIVE = ["walk", "hike", "beach", "night_sky", "faith", "event"];
const MEAL = ["food", "drink"];
const isActive = (t: EngineThing) => t.kind !== null && ACTIVE.includes(t.kind);
const isMeal = (t: EngineThing) => t.kind !== null && MEAL.includes(t.kind);

export function buildChains(things: EngineThing[], maxHopMinutes = 15): Chain[] {
  const pinned = things.filter((t): t is EngineThing & { lat: number; lng: number } => t.lat !== null && t.lng !== null);
  const out: Chain[] = [];
  for (let i = 0; i < pinned.length; i++) {
    for (let j = 0; j < pinned.length; j++) {
      if (i === j) continue;
      const a = pinned[i];
      const b = pinned[j];
      // Each pair once in list order, unless the reverse puts the walk first.
      if (i > j && !(isActive(a) && isMeal(b))) continue;
      const hop = estimateLegMinutes(distanceKm(a, b));
      if (hop <= maxHopMinutes) out.push({ things: [a, b], hopMinutes: hop });
    }
  }
  return out;
}
