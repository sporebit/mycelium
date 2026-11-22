/**
 * PhirstMaxx research — the outside-world readers (spec §6 steps 1–4).
 *
 * Each reader talks to one kind of source and hands back typed results or
 * null; none throws across its boundary. Every fact names where it came
 * from, how sure the reader is, and is written as-is to pm_thing_facts by
 * the pipeline (which adds checked_at and never overwrites a hand edit,
 * spec §2 rule 4). No key is required anywhere: Google and YouTube keys
 * add detail, and each keyed call has a free route behind it (rule 3).
 *
 *   website  — the page itself: JSON-LD, OpenGraph, readable text
 *   youtube  — oEmbed always, the Data API when keyed
 *   social   — Instagram / Facebook / TikTok, a best-effort public look
 *   exif     — a photo's own time and GPS
 *   geocode  — Nominatim, Google Places (keyed), the duplicate rule
 *   osm      — Overpass: what is near, and the tags of a thing
 *   routing  — Google Routes (keyed) → OpenRouteService (keyed, free) → estimate
 *   hours    — the one opening-hours shape all of the above normalise to
 */
import type { SourceKind } from "@/lib/phirstmaxx/types";

/** One researched fact, ready for pm_thing_facts. confidence is 0–1. */
export type Fact = { key: string; value: unknown; source_url: string | null; source_kind: SourceKind; confidence: number };

export * from "./hours";
export * from "./website";
export * from "./youtube";
export * from "./social";
export * from "./exif";
export * from "./geocode";
export * from "./osm";
export * from "./routing";
