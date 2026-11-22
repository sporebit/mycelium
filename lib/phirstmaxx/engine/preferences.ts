/**
 * PhirstMaxx engine — preference learning. Turns a person's ratings,
 * "again?" answers and repeats into a tag to 0..1 weight that scoring reads
 * as `taste`. Three signals, as the old decision log has it: stars, the
 * again answer, and simply doing a thing more than once. Recent memories
 * count more (a 240-day half-life); a tag with no evidence stays at 0.5,
 * the neutral value. Pure: `now` is always passed in.
 */

export type AgainSignal = "love" | "repeat" | "meh";

/** What learning reads of a memory (a done plan with its ratings). */
export type EngineMemory = {
  done_on: string;
  tags: string[];
  /** person id to 1–5 stars */
  rating_by: Record<string, number>;
  again_by: Record<string, AgainSignal>;
};

export type TagWeights = Record<string, number>;

const HALF_LIFE_DAYS = 240;
const DAY_MS = 86_400_000;

/** Both signals mapped onto 0..1 and blended; either alone is enough. */
function signal(rating: number | undefined, again: AgainSignal | undefined): number | null {
  const fromStars = rating !== undefined ? (Math.max(1, Math.min(5, rating)) - 1) / 4 : null;
  const fromAgain = again === "love" ? 1 : again === "repeat" ? 0.7 : again === "meh" ? 0.15 : null;
  if (fromStars !== null && fromAgain !== null) return fromStars * 0.6 + fromAgain * 0.4;
  return fromStars ?? fromAgain;
}

export function learnTagWeights(memories: EngineMemory[], personId: string, now: number): TagWeights {
  const sum: Record<string, number> = {};
  const weight: Record<string, number> = {};
  const repeats: Record<string, number> = {};

  for (const m of memories) {
    const s = signal(m.rating_by[personId], m.again_by[personId]);
    const ageDays = Math.max(0, (now - Date.parse(m.done_on)) / DAY_MS);
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    for (const tag of new Set(m.tags)) {
      repeats[tag] = (repeats[tag] ?? 0) + 1;
      if (s === null) continue;
      sum[tag] = (sum[tag] ?? 0) + s * decay;
      weight[tag] = (weight[tag] ?? 0) + decay;
    }
  }

  const out: TagWeights = {};
  for (const tag of Object.keys(repeats)) {
    // Doing a thing three times without rating it is still a vote for it.
    const w = weight[tag] ?? 0;
    const explicit = w ? sum[tag] / w : null;
    const implicit = Math.min(1, 0.5 + 0.1 * (repeats[tag] - 1));
    const confidence = Math.min(1, w / 2);
    const value = explicit === null ? implicit : explicit * confidence + implicit * (1 - confidence);
    out[tag] = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
  }
  return out;
}

/** Tags in the pool this person has never done. For "you haven't tried…". */
export function untriedTags(memories: EngineMemory[], poolTags: string[]): string[] {
  const done = new Set(memories.flatMap((m) => m.tags));
  return Array.from(new Set(poolTags)).filter((t) => !done.has(t));
}

/** Consecutive weeks (Monday-start, ending this week) with at least one memory. */
export function weeklyStreak(memories: EngineMemory[], now: number): number {
  const weekOf = (instant: number) => {
    const d = new Date(instant);
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
  };
  const weeks = new Set(memories.map((m) => weekOf(Date.parse(m.done_on))));
  let streak = 0;
  for (let cursor = weekOf(now); weeks.has(cursor); cursor -= 7 * DAY_MS) streak++;
  return streak;
}
