/**
 * PhirstMaxx research — the pipeline (spec §6; "never fail us" rules §2.2–2.4, 2.7).
 *
 * One job per drop on the jobs queue (kind "pm_research", lane cloud,
 * payload {space_id, drop_id, force}). A run walks the six stages in order,
 * each in its own try/catch and each recorded in pm_research_runs:
 *
 *   read      what the link, photo or words say (readers/*, vision)
 *   resolve   which real-world thing it is: geocode, match or make a thing;
 *             with no name at all, ask the dropper one question and wait
 *   enrich    official site → OpenStreetMap → Google Places → web search;
 *             facts upserted, the best per key folded into the thing's columns
 *   travel    every saved start point × mode into pm_travel, provider named
 *   fit       the engine: does it fit the next eight weeks, and when next
 *   notify    one push to the dropper
 *
 * A stage that throws is marked failed with attempts + 1 and a back-off
 * (2^attempts minutes, at most 60); the stages that do not depend on it
 * still run (enrich, travel, fit and notify depend on resolve; nothing
 * depends on read or enrich). While any stage is failed and still
 * retryable the run throws at the end, so the queue brings the job back;
 * once every stage is done, skipped or waiting it returns {done: true}.
 * `force` re-runs done stages (the Re-research button; a new answer).
 *
 * Paid model calls (vision, web search) go through the research spend rule
 * (spec §11.5): the owner's pm_people.settings.research_cap_pence must be
 * set — 0 for the shared £5 cap, more for PhirstMaxx's own monthly cap —
 * or the paid step is skipped with "Research spend not yet allowed
 * (checklist 7.1)" and researchStatus() says so. Every call's cost is
 * written on the run and in api_usage (tag phirstmaxx.research).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cloudAllowed } from "@/lib/ai/budget";
import { recordUsage } from "@/lib/ai/usage";
import { registerJobHandler } from "@/lib/jobs/handlers";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import type { JobRow } from "@/lib/system/jobs";
import { distanceKm, formatDuration, travelMinutes } from "../engine";
import { fitsForThing, loadThing, type ThingRow } from "../fitting";
import { notifyPerson } from "../notify";
import { DROP_COLS, RESEARCH_JOB, startResearch } from "../server";
import { type PmDrop, type PmFact, type PmResearchRun, RESEARCH_STAGES, type ResearchStage, type RunStatus, SOURCE_KINDS, type SourceKind, type TravelMode } from "../types";
import {
  classifySocial,
  type Fact,
  type FetchLike,
  googlePlaceDetails,
  googlePlacesFind,
  nearDuplicate,
  nominatimReverse,
  nominatimSearch,
  osmFacts,
  overpassAround,
  parseExif,
  parseYouTubeId,
  readSocial,
  readWebsite,
  readYouTube,
  routeWithFallback,
} from "./readers";
import { readImage } from "./vision";
import { webSearchFacts } from "./websearch";

export const RESEARCH_TAG = "phirstmaxx.research";
export const MAX_STAGE_ATTEMPTS = 5;
export const NOT_ALLOWED_REASON = "Research spend not yet allowed (checklist 7.1)";
export const GOOGLE_MONTHLY_CAP = 900;
export const RECHECK_DAYS = 90;
export const TRAVEL_FRESH_DAYS = 30;
export const QUESTION = "What's this place called?";
export const RUN_COLS = "id, drop_id, stage, status, attempts, error, started_at, finished_at, run_after, cost_pence, provider, detail";

/** Which stages must be done before a stage may run. */
export const STAGE_DEPS: Record<ResearchStage, ResearchStage[]> = { read: [], resolve: [], enrich: ["resolve"], travel: ["resolve"], fit: ["resolve"], notify: ["resolve"] };

export type Payload = { space_id: string; drop_id: string; force?: boolean };
export type RunRow = PmResearchRun & { detail: Record<string, unknown> };
export type StageOutcome = { status?: Extract<RunStatus, "done" | "skipped" | "waiting">; detail?: Record<string, unknown>; provider?: string | null; cost_pence?: number; error?: string | null };
export type StageCtx = {
  db: SupabaseClient;
  spaceId: string;
  drop: PmDrop;
  runs: Record<ResearchStage, RunRow>;
  thing: ThingRow | null;
  now: number;
  force: boolean;
  fetch?: FetchLike;
};
export type StageFn = (c: StageCtx) => Promise<StageOutcome>;
export type StageTable = Record<ResearchStage, StageFn>;
export type StageAction = "run" | "skip" | "hold" | "blocked";

const MINUTE = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

// ---------------------------------------------------------------------------
// The pure decisions

/** Minutes before a failed stage is tried again: 1, 2, 4, 8 … capped at an hour. */
export function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts));
}

/**
 * What to do with one stage now, given its run row and the rows of the
 * stages it depends on (as they stand at this point in the walk).
 */
export function decideStage(run: Pick<RunRow, "status" | "attempts" | "run_after">, deps: ReadonlyArray<Pick<RunRow, "status" | "attempts">>, now: number, force: boolean): StageAction {
  if (deps.some((d) => d.status !== "done")) return "blocked";
  if (force) return "run";
  if (run.status === "done" || run.status === "skipped") return "skip";
  if (run.status === "waiting") return "hold";
  if (run.status === "failed") {
    if (run.attempts >= MAX_STAGE_ATTEMPTS) return "skip";
    return Date.parse(run.run_after) <= now ? "run" : "hold";
  }
  return "run";
}

/** A failed stage that the queue should bring back. */
export const retryable = (r: Pick<RunRow, "status" | "attempts">): boolean => r.status === "failed" && r.attempts < MAX_STAGE_ATTEMPTS;
/** A dependency that will never be done without a person: given up, or skipped. */
const deadEnd = (r: Pick<RunRow, "status" | "attempts">): boolean => r.status === "skipped" || (r.status === "failed" && r.attempts >= MAX_STAGE_ATTEMPTS);

export type PaidDecision = { allowed: boolean; reason: string | null; mode: "shared" | "own" | "none" | "nokey" };

/** The research spend rule (spec §11.5), pure. */
export function paidDecision(input: { hasKey: boolean; cap: unknown; sharedAllowed: boolean; monthSpentPence: number }): PaidDecision {
  const cap = typeof input.cap === "number" && Number.isFinite(input.cap) && input.cap >= 0 ? input.cap : null;
  if (cap === null) return { allowed: false, reason: NOT_ALLOWED_REASON, mode: "none" };
  if (!input.hasKey) return { allowed: false, reason: "No AI key is set on this server", mode: "nokey" };
  if (cap === 0) return input.sharedAllowed ? { allowed: true, reason: null, mode: "shared" } : { allowed: false, reason: "The shared £5 monthly AI cap is spent", mode: "shared" };
  return input.monthSpentPence < cap
    ? { allowed: true, reason: null, mode: "own" }
    : { allowed: false, reason: `PhirstMaxx's monthly research cap (£${(cap / 100).toFixed(2)}) is spent`, mode: "own" };
}

const KIND_HINTS: Array<[RegExp, string]> = [
  [/castle|fort|ruin|abbey|priory|historic|monument|heritage|hall$|manor/i, "historic"],
  [/museum/i, "museum"],
  [/gallery|art_gallery/i, "gallery"],
  [/theatre|theater/i, "theatre"],
  [/cinema|movie_theater/i, "cinema"],
  [/pub|bar\b|biergarten/i, "pub"],
  [/cafe|coffee|tea_?room|bakery/i, "cafe"],
  [/restaurant|food|meal|dining/i, "food"],
  [/market/i, "market"],
  [/beach/i, "beach"],
  [/garden|arboretum/i, "garden"],
  [/park|nature_reserve|woodland|wood\b|forest|common/i, "park"],
  [/viewpoint|peak|summit/i, "viewpoint"],
  [/zoo|aquarium|wildlife|bird|farm/i, "wildlife"],
  [/swim|lido|pool|beach_resort/i, "swim"],
  [/observatory|planetarium|dark_sky/i, "night_sky"],
  [/shop|store|mall/i, "shop"],
  [/trail|path|hiking|walk/i, "walk"],
  [/attraction|theme_park|amusement|bowling|climbing|sports_centre|escape/i, "activity"],
  [/event|festival|concert/i, "event"],
];

/** A kind for a thing from its OSM "tourism=attraction" and Google types, or null. */
export function kindFromHints(hints: readonly string[]): string | null {
  for (const h of hints) for (const [re, kind] of KIND_HINTS) if (re.test(h)) return kind;
  return null;
}

/** "£5", "£12.50", "5.00" → pence; null when unreadable. */
export function poundsToPence(s: unknown): number | null {
  if (typeof s === "number" && Number.isFinite(s)) return Math.round(s * 100);
  if (typeof s !== "string") return null;
  const m = /(\d+(?:\.\d{1,2})?)/.exec(s.replace(/,/g, ""));
  return m ? Math.round(Number(m[1]) * 100) : null;
}

type FactLite = Pick<PmFact, "key" | "value" | "confidence" | "checked_at" | "edited_by_user">;

/** The best fact per key: a hand edit first, then confidence, then the most recent check. */
export function bestFacts(facts: readonly FactLite[]): Record<string, FactLite> {
  const best: Record<string, FactLite> = {};
  for (const f of facts) {
    const cur = best[f.key];
    if (!cur) {
      best[f.key] = f;
      continue;
    }
    const a = [Number(f.edited_by_user), f.confidence, Date.parse(f.checked_at) || 0];
    const b = [Number(cur.edited_by_user), cur.confidence, Date.parse(cur.checked_at) || 0];
    if (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]) best[f.key] = f;
  }
  return best;
}

export type FoldedColumns = Partial<Pick<ThingRow, "min_minutes" | "max_minutes" | "indoor" | "dog_rule" | "cost_pence" | "summary" | "kind" | "address" | "lat" | "lng" | "best_time_of_day" | "seasons" | "tags">>;

/** The best fact per key folded into pm_things columns, leaving every hand-edited column alone. Pure. */
export function foldFacts(thing: Pick<ThingRow, "hand_edited" | "kind" | "lat" | "lng">, facts: readonly FactLite[]): FoldedColumns {
  const best = bestFacts(facts);
  const locked = new Set(thing.hand_edited ?? []);
  const out: FoldedColumns = {};
  const set = <K extends keyof FoldedColumns>(col: K, v: FoldedColumns[K]) => {
    if (!locked.has(col) && v !== undefined && v !== null) out[col] = v;
  };
  const v = (key: string) => best[key]?.value;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

  const mins = v("typical_minutes") as { min?: unknown; max?: unknown } | undefined;
  if (mins && typeof mins === "object") {
    set("min_minutes", num(mins.min) ?? undefined);
    set("max_minutes", num(mins.max) ?? undefined);
  } else {
    set("min_minutes", num(v("min_minutes")) ?? num(v("duration_minutes")) ?? undefined);
    set("max_minutes", num(v("max_minutes")) ?? undefined);
  }
  if (typeof v("indoor") === "boolean") set("indoor", v("indoor") as boolean);
  const dog = v("dog_rule");
  if (dog === "yes" || dog === "no" || dog === "outside_only") set("dog_rule", dog);

  const price = v("price") as { adult_pence?: unknown; free?: unknown } | undefined;
  if (price && typeof price === "object") {
    if (price.free === true) set("cost_pence", 0);
    else set("cost_pence", num(price.adult_pence) ?? undefined);
  } else if (v("fee") === false || v("price_level") === "free") set("cost_pence", 0);
  else if (v("charge") !== undefined) set("cost_pence", poundsToPence(v("charge")) ?? undefined);
  else if (v("price_range") !== undefined) set("cost_pence", poundsToPence(v("price_range")) ?? undefined);

  const summary = (typeof v("summary") === "string" ? v("summary") : typeof v("description") === "string" ? v("description") : null) as string | null;
  if (summary) set("summary", summary.slice(0, 2000));

  const kind = typeof v("kind") === "string" ? (v("kind") as string) : kindFromHints([v("osm_kind"), ...(Array.isArray(v("google_types")) ? (v("google_types") as string[]) : []), v("jsonld_type")].filter((x): x is string => typeof x === "string"));
  if (kind && (!thing.kind || !locked.has("kind"))) set("kind", kind);

  if (typeof v("address") === "string") set("address", (v("address") as string).slice(0, 400));
  const geo = v("geo") as { lat?: unknown; lng?: unknown } | undefined;
  if (geo && typeof geo === "object" && num(geo.lat) !== null && num(geo.lng) !== null && (thing.lat === null || thing.lng === null)) {
    set("lat", num(geo.lat) as number);
    set("lng", num(geo.lng) as number);
  }
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, 12) : null);
  const tod = arr(v("best_time_of_day"));
  if (tod && tod.length) set("best_time_of_day", tod);
  const seasons = arr(v("seasons"));
  if (seasons) set("seasons", seasons);
  const tags = arr(v("tags"));
  if (tags && tags.length) set("tags", tags);
  return out;
}

// ---------------------------------------------------------------------------
// Rows

async function loadDrop(db: SupabaseClient, spaceId: string, dropId: string): Promise<PmDrop | null> {
  const { data, error } = await db.from("pm_drops").select(DROP_COLS).eq("space_id", spaceId).eq("id", dropId).maybeSingle();
  if (error) throw new Error(`pm_drops: ${error.message}`);
  return (data as PmDrop | null) ?? null;
}

/** One row per stage, made where missing. */
export async function ensureRuns(db: SupabaseClient, spaceId: string, dropId: string): Promise<Record<ResearchStage, RunRow>> {
  const { data, error } = await db.from("pm_research_runs").select(RUN_COLS).eq("drop_id", dropId);
  if (error) throw new Error(`pm_research_runs: ${error.message}`);
  const have = new Map(((data ?? []) as RunRow[]).map((r) => [r.stage, r]));
  const missing = RESEARCH_STAGES.filter((s) => !have.has(s)).map((stage) => ({ space_id: spaceId, drop_id: dropId, stage, status: "queued", run_after: new Date().toISOString() }));
  if (missing.length) {
    const ins = await db.from("pm_research_runs").upsert(missing, { onConflict: "drop_id,stage", ignoreDuplicates: true }).select(RUN_COLS);
    if (ins.error) throw new Error(`pm_research_runs: ${ins.error.message}`);
    for (const r of (ins.data ?? []) as RunRow[]) have.set(r.stage, r);
    if (missing.some((m) => !have.has(m.stage))) {
      const again = await db.from("pm_research_runs").select(RUN_COLS).eq("drop_id", dropId);
      for (const r of (again.data ?? []) as RunRow[]) have.set(r.stage, r);
    }
  }
  const out = {} as Record<ResearchStage, RunRow>;
  for (const s of RESEARCH_STAGES) {
    const r = have.get(s);
    if (!r) throw new Error(`pm_research_runs: no ${s} row for ${dropId}`);
    out[s] = { ...r, attempts: Number(r.attempts ?? 0), cost_pence: Number(r.cost_pence ?? 0), run_after: r.run_after ?? new Date(0).toISOString(), detail: (r.detail as Record<string, unknown>) ?? {} };
  }
  return out;
}

async function saveRun(db: SupabaseClient, run: RunRow, patch: Partial<RunRow>): Promise<RunRow> {
  const next = { ...run, ...patch, updated_at: new Date().toISOString() } as RunRow & { updated_at: string };
  const { error } = await db.from("pm_research_runs").update({ ...patch, updated_at: next.updated_at }).eq("id", run.id);
  if (error) throw new Error(`pm_research_runs: ${error.message}`);
  return next;
}

/**
 * Facts in, never over a hand edit: a row matching (key, source_kind,
 * source_url) is refreshed when a person has not edited it; a new one is
 * inserted. Null values and unknown source kinds are dropped.
 */
export async function upsertFacts(db: SupabaseClient, spaceId: string, thingId: string, facts: readonly Fact[], now: number = Date.now()): Promise<{ inserted: number; updated: number }> {
  const clean = facts.filter((f) => f.value !== null && f.value !== undefined && f.key && (SOURCE_KINDS as readonly string[]).includes(f.source_kind));
  if (clean.length === 0) return { inserted: 0, updated: 0 };
  const { data, error } = await db.from("pm_thing_facts").select("id, key, source_kind, source_url, edited_by_user").eq("thing_id", thingId).limit(2000);
  if (error) throw new Error(`pm_thing_facts: ${error.message}`);
  const existing = new Map(((data ?? []) as Array<{ id: string; key: string; source_kind: string; source_url: string | null; edited_by_user: boolean }>).map((r) => [`${r.key}|${r.source_kind}|${r.source_url ?? ""}`, r]));
  const at = iso(now);
  const inserts: Record<string, unknown>[] = [];
  let updated = 0;
  const seen = new Set<string>();
  for (const f of clean) {
    const k = `${f.key}|${f.source_kind}|${f.source_url ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const row = existing.get(k);
    const confidence = Math.max(0, Math.min(1, f.confidence));
    if (row) {
      if (row.edited_by_user) continue;
      const u = await db.from("pm_thing_facts").update({ value: f.value, confidence, checked_at: at }).eq("id", row.id);
      if (!u.error) updated += 1;
    } else {
      inserts.push({ space_id: spaceId, thing_id: thingId, key: f.key, value: f.value, source_url: f.source_url, source_kind: f.source_kind, confidence, checked_at: at });
    }
  }
  if (inserts.length) {
    const ins = await db.from("pm_thing_facts").insert(inserts);
    if (ins.error) throw new Error(`pm_thing_facts: ${ins.error.message}`);
  }
  return { inserted: inserts.length, updated };
}

async function factsFor(db: SupabaseClient, thingId: string): Promise<PmFact[]> {
  const { data, error } = await db.from("pm_thing_facts").select("id, thing_id, key, value, source_url, source_kind, confidence, checked_at, edited_by_user").eq("thing_id", thingId).limit(2000);
  if (error) throw new Error(`pm_thing_facts: ${error.message}`);
  return (data ?? []) as PmFact[];
}

// ---------------------------------------------------------------------------
// The paid rule, against the database

async function ownerCap(db: SupabaseClient, spaceId: string): Promise<unknown> {
  const owner = await db.from("profiles").select("id").eq("is_instance_owner", true).limit(1).maybeSingle();
  const uid = (owner.data as { id: string } | null)?.id ?? PHIL_AUTH_UID;
  const { data } = await db.from("pm_people").select("settings").eq("space_id", spaceId).eq("person_id", uid).maybeSingle();
  return ((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}).research_cap_pence;
}

/** This London month's research spend, from the runs. */
export async function monthResearchPence(db: SupabaseClient, spaceId: string, now: Date = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data } = await db.from("pm_research_runs").select("cost_pence").eq("space_id", spaceId).gt("cost_pence", 0).gte("updated_at", monthStart).limit(5000);
  return ((data ?? []) as Array<{ cost_pence: number }>).reduce((s, r) => s + Number(r.cost_pence || 0), 0);
}

export async function paidGate(db: SupabaseClient, spaceId: string, now: Date = new Date()): Promise<PaidDecision> {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const cap = await ownerCap(db, spaceId);
  const sharedAllowed = cap === 0 ? await cloudAllowed(db) : false;
  const monthSpentPence = typeof cap === "number" && cap > 0 ? await monthResearchPence(db, spaceId, now) : 0;
  return paidDecision({ hasKey, cap, sharedAllowed, monthSpentPence });
}

async function countGoogle(db: SupabaseClient, spaceId: string, product: "places" | "routes"): Promise<boolean> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return false;
  const { data, error } = await db.rpc("pm_count_api_call", { p_space: spaceId, p_provider: "google", p_product: product, p_cap: GOOGLE_MONTHLY_CAP });
  if (error) {
    console.error("[phirstmaxx/research] pm_count_api_call:", error.message);
    return false;
  }
  return data === true;
}

async function recordCost(db: SupabaseClient, c: StageCtx, stage: ResearchStage, kind: string, r: { model: string; input_tokens: number; output_tokens: number; cost_pence: number; searches?: number }): Promise<void> {
  await recordUsage(db, { tag: RESEARCH_TAG, model: r.model, input_tokens: r.input_tokens, output_tokens: r.output_tokens, cost_pence: r.cost_pence, meta: { drop: c.drop.id, stage, kind, searches: r.searches ?? 0 } });
}

// ---------------------------------------------------------------------------
// Stage: read

export type NameCandidate = { name: string; confidence: number; source: SourceKind };
export type ReadDetail = {
  kind: "website" | "youtube" | "social" | "photo" | "text";
  names: NameCandidate[];
  town: string | null;
  geo: { lat: number; lng: number; source: SourceKind } | null;
  facts: Fact[];
  text: string | null;
  image: string | null;
  providers: string[];
  vision_skipped?: string;
  taken_at?: string | null;
};

const looksLikeName = (t: string) => t.length > 1 && t.length <= 80 && !/https?:\/\//i.test(t) && !/\n/.test(t);

async function downloadMedia(db: SupabaseClient, path: string): Promise<Uint8Array | null> {
  const { data, error } = await db.storage.from("phirstmaxx").download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

const readStage: StageFn = async (c) => {
  const { drop } = c;
  const detail: ReadDetail = { kind: "text", names: [], town: null, geo: null, facts: [], text: drop.text, image: null, providers: [] };
  const url = drop.url;
  let cost = 0;
  const pushNames = (facts: Fact[]) => {
    for (const f of facts) if (f.key === "name" && typeof f.value === "string" && looksLikeName(f.value)) detail.names.push({ name: f.value, confidence: f.confidence, source: f.source_kind });
  };
  const pushGeo = (facts: Fact[]) => {
    for (const f of facts) {
      const g = f.value as { lat?: unknown; lng?: unknown };
      if (f.key === "geo" && g && typeof g.lat === "number" && typeof g.lng === "number" && !detail.geo) detail.geo = { lat: g.lat, lng: g.lng, source: f.source_kind };
    }
  };

  if (url && parseYouTubeId(url)) {
    detail.kind = "youtube";
    const r = await readYouTube(url, { apiKey: process.env.YOUTUBE_API_KEY ?? null, fetch: c.fetch });
    if (!r) throw new Error("YouTube did not answer");
    detail.providers.push(...r.sources);
    detail.facts.push(...r.facts);
    if (r.title && looksLikeName(r.title)) detail.names.push({ name: r.title, confidence: 0.35, source: "youtube" });
    if (r.location) detail.geo = { ...r.location, source: "youtube" };
    detail.town = r.location_description;
    detail.text = [drop.text, r.description].filter(Boolean).join("\n\n") || null;
    detail.image = r.thumbnail_url;
    pushNames(r.facts);
  } else if (url && classifySocial(url)) {
    detail.kind = "social";
    const r = await readSocial(url, c.fetch);
    if (r) {
      detail.providers.push(r.blocked ? `${r.kind}:blocked` : r.kind);
      detail.facts.push(...r.facts);
      detail.text = [drop.text, r.caption].filter(Boolean).join("\n\n") || null;
      detail.image = r.image;
      pushNames(r.facts);
    }
  } else if (url) {
    detail.kind = "website";
    const r = await readWebsite(url, c.fetch);
    if (!r) {
      if (!drop.text && drop.media_paths.length === 0) throw new Error("The site did not answer");
      detail.providers.push("website:unreachable");
    } else {
      detail.providers.push(r.not_html ? "website:not-html" : "website");
      detail.facts.push(...r.facts);
      detail.image = r.image;
      detail.text = [drop.text, r.description].filter(Boolean).join("\n\n") || null;
      pushNames(r.facts);
      pushGeo(r.facts);
    }
  }

  if (drop.media_paths.length > 0) {
    if (detail.kind === "text") detail.kind = "photo";
    const bytes = await downloadMedia(c.db, drop.media_paths[0]);
    if (!bytes) throw new Error("The picture could not be read from storage");
    const exif = parseExif(bytes);
    if (exif) {
      detail.providers.push("exif");
      detail.taken_at = exif.taken_at;
      if (exif.lat !== null && exif.lng !== null) {
        detail.geo = { lat: exif.lat, lng: exif.lng, source: "exif" };
        detail.facts.push({ key: "geo", value: { lat: exif.lat, lng: exif.lng }, source_url: null, source_kind: "exif", confidence: 0.9 });
      }
      if (exif.taken_at) detail.facts.push({ key: "photo_taken_at", value: exif.taken_at, source_url: null, source_kind: "exif", confidence: 0.9 });
    }
    const gate = await paidGate(c.db, c.spaceId, new Date(c.now));
    if (!gate.allowed) detail.vision_skipped = gate.reason ?? "not allowed";
    else {
      const v = await readImage({ bytes, hint: detail.text ?? drop.text }, { fetch: c.fetch as typeof fetch | undefined });
      if (v) {
        detail.providers.push("vision");
        cost += v.cost_pence;
        await recordCost(c.db, c, "read", "vision", v);
        if (v.place_name) detail.names.push({ name: v.place_name, confidence: v.confidence, source: "vision" });
        if (v.town) detail.town = detail.town ?? v.town;
        if (v.signage_text) detail.facts.push({ key: "signage_text", value: v.signage_text, source_url: null, source_kind: "vision", confidence: v.confidence });
        if (v.scene) detail.facts.push({ key: "scene", value: v.scene, source_url: null, source_kind: "vision", confidence: 0.6 });
      }
    }
  }

  // the words that came with it, and the one answer, outrank anything read
  if (drop.answer && looksLikeName(drop.answer.trim())) detail.names.unshift({ name: drop.answer.trim(), confidence: 1, source: "person" });
  else if (drop.text && looksLikeName(drop.text.trim()) && detail.names.length === 0) detail.names.push({ name: drop.text.trim(), confidence: 0.6, source: "person" });
  detail.names.sort((a, b) => b.confidence - a.confidence);
  return { detail: detail as unknown as Record<string, unknown>, provider: detail.providers[0] ?? null, cost_pence: cost };
};

// ---------------------------------------------------------------------------
// Stage: resolve

export type ResolveDetail = { thing_id: string; matched: boolean; provider: string | null; place_id: string | null; query: string | null; asked?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const resolveStage: StageFn = async (c) => {
  const read = (c.runs.read.detail ?? {}) as Partial<ReadDetail>;
  const names = [...(read.names ?? [])];
  if (c.drop.answer && !names.some((n) => n.source === "person")) names.unshift({ name: c.drop.answer.trim(), confidence: 1, source: "person" });
  let name = names[0]?.name ?? null;
  const town = read.town ?? null;
  const geo = read.geo ?? null;
  const facts: Fact[] = [];
  const providers: string[] = [];

  // a pinned photo with no name: the nearest named thing on the map
  let reverse: Awaited<ReturnType<typeof nominatimReverse>> = null;
  if (!name && geo) {
    reverse = await nominatimReverse(geo.lat, geo.lng, c.fetch);
    if (reverse?.name) {
      name = reverse.name;
      providers.push("nominatim:reverse");
    }
  }

  if (!name) {
    // ask once, then wait for answerQuestion()
    const already = c.drop.question === QUESTION && !c.drop.answer;
    if (!already) {
      await c.db.from("pm_drops").update({ question: QUESTION }).eq("id", c.drop.id);
      if (c.thing) await c.db.from("pm_things").update({ status: "needs_answer", updated_at: iso(c.now) }).eq("id", c.thing.id);
      await notifyPerson(c.db, c.spaceId, c.drop.person_id, { kind: "question", title: QUESTION, body: c.drop.url ?? c.drop.text?.slice(0, 120) ?? "The picture you shared", url: `/phirstmaxx/things?drop=${c.drop.id}`, drop_id: c.drop.id, counts: false }, new Date(c.now));
    }
    return { status: "waiting", detail: { asked: true, question: QUESTION }, error: "Waiting for an answer: what is this place called?" };
  }

  let location: { lat: number; lng: number; address: string | null; name: string } | null = null;
  let placeId: string | null = null;
  const query = town && !name.toLowerCase().includes(town.toLowerCase()) ? `${name}, ${town}` : name;

  if (reverse) {
    location = { lat: reverse.lat, lng: reverse.lng, address: reverse.address || null, name: reverse.name };
    facts.push(...geoFacts(reverse, "osm"));
  } else {
    if (geo) await sleep(0); // nothing yet; the one-a-second rule is kept by the queue running jobs in turn
    let hits = await nominatimSearch(query, c.fetch);
    if (hits && hits.length === 0 && query !== name) {
      await sleep(1100);
      hits = await nominatimSearch(name, c.fetch);
    }
    if (hits === null && !geo) throw new Error("Nominatim did not answer");
    if (hits && hits.length) {
      providers.push("nominatim");
      const hit = geo ? [...hits].sort((a, b) => distanceKm(a, geo) - distanceKm(b, geo))[0] : hits[0];
      if (!geo || distanceKm(hit, geo) <= 25) {
        location = { lat: hit.lat, lng: hit.lng, address: hit.address || null, name: hit.name || name };
        facts.push(...geoFacts(hit, "osm"));
      }
    }
    if (process.env.GOOGLE_MAPS_API_KEY && (await countGoogle(c.db, c.spaceId, "places"))) {
      const g = await googlePlacesFind(query, process.env.GOOGLE_MAPS_API_KEY, c.fetch, geo ?? location ?? undefined);
      if (g && g.lat !== null && g.lng !== null && (!location || distanceKm({ lat: g.lat, lng: g.lng }, location) <= 25)) {
        providers.push("google_places");
        placeId = g.place_id;
        location = { lat: g.lat, lng: g.lng, address: g.address, name: g.name || location?.name || name };
        facts.push(...g.facts);
      }
    }
    if (!location && geo) location = { lat: geo.lat, lng: geo.lng, address: null, name };
  }

  // the same place already in the list?
  let thing = c.thing;
  let matched = false;
  if (!thing && location) {
    const { data } = await c.db.from("pm_things").select("id, name, lat, lng").eq("space_id", c.spaceId).not("lat", "is", null).neq("status", "archived").limit(500);
    const dup = ((data ?? []) as Array<{ id: string; name: string; lat: number; lng: number }>).find((t) => nearDuplicate({ lat: location!.lat, lng: location!.lng, name: location!.name }, t));
    if (dup) {
      thing = await loadThing(c.db, c.spaceId, dup.id);
      matched = !!thing;
    }
  }
  if (!thing) {
    const row = {
      space_id: c.spaceId,
      name: (names.find((n) => n.source === "person")?.name ?? location?.name ?? name).slice(0, 200),
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      address: location?.address?.slice(0, 400) ?? null,
      status: "researching",
      image_path: null,
    };
    const ins = await c.db.from("pm_things").insert(row).select("id").single();
    if (ins.error) throw new Error(`pm_things: ${ins.error.message}`);
    thing = await loadThing(c.db, c.spaceId, (ins.data as { id: string }).id);
    if (!thing) throw new Error("pm_things: the new thing could not be read back");
  } else if (location && (thing.lat === null || thing.lng === null) && !thing.hand_edited?.includes("lat")) {
    await c.db.from("pm_things").update({ lat: location.lat, lng: location.lng, address: thing.address ?? location.address, updated_at: iso(c.now) }).eq("id", thing.id);
    thing = (await loadThing(c.db, c.spaceId, thing.id)) ?? thing;
  }
  if (thing.status === "needs_answer") {
    await c.db.from("pm_things").update({ status: "researching", updated_at: iso(c.now) }).eq("id", thing.id);
  }
  await c.db.from("pm_drops").update({ thing_id: thing.id, question: null }).eq("id", c.drop.id);
  c.thing = thing;
  c.drop = { ...c.drop, thing_id: thing.id, question: null };

  const readFacts = (read.facts ?? []) as Fact[];
  const person: Fact[] = c.drop.answer ? [{ key: "name", value: c.drop.answer.trim(), source_url: null, source_kind: "person", confidence: 1 }] : [];
  if (c.drop.url) person.push({ key: "dropped_url", value: c.drop.url, source_url: c.drop.url, source_kind: "person", confidence: 1 });
  if (read.image) person.push({ key: "image", value: read.image, source_url: c.drop.url, source_kind: read.kind === "youtube" ? "youtube" : "opengraph", confidence: 0.5 });
  await upsertFacts(c.db, c.spaceId, thing.id, [...readFacts, ...facts, ...person], c.now);

  const detail: ResolveDetail = { thing_id: thing.id, matched, provider: providers[0] ?? null, place_id: placeId, query };
  return { detail: detail as unknown as Record<string, unknown>, provider: providers[0] ?? (location ? "read" : null) };
};

function geoFacts(hit: { name: string; lat: number; lng: number; address: string; osm_type: string | null; osm_id: number | null; kind: string | null }, source: SourceKind): Fact[] {
  const url = hit.osm_type && hit.osm_id ? `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}` : null;
  const out: Fact[] = [{ key: "geo", value: { lat: hit.lat, lng: hit.lng }, source_url: url, source_kind: source, confidence: 0.7 }];
  if (hit.address) out.push({ key: "address", value: hit.address, source_url: url, source_kind: source, confidence: 0.7 });
  if (hit.name) out.push({ key: "name", value: hit.name, source_url: url, source_kind: source, confidence: 0.6 });
  if (hit.kind) out.push({ key: "osm_kind", value: hit.kind, source_url: url, source_kind: source, confidence: 0.7 });
  return out;
}

// ---------------------------------------------------------------------------
// Stage: enrich

const hostOf = (u: string | null | undefined): string | null => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

const enrichStage: StageFn = async (c) => {
  const thing = c.thing;
  if (!thing) return { status: "skipped", error: "No thing to enrich yet" };
  const providers: string[] = [];
  const facts: Fact[] = [];
  let cost = 0;
  const have = await factsFor(c.db, thing.id);
  const best = bestFacts(have);

  // 1. the official site, when we know one and it is not the page already read
  const site = typeof best.website?.value === "string" ? best.website.value : null;
  if (site && hostOf(site) && hostOf(site) !== hostOf(c.drop.url)) {
    const r = await readWebsite(site, c.fetch);
    if (r && !r.not_html) {
      providers.push("official_site");
      facts.push(...r.facts.map((f) => (f.source_kind === "opengraph" ? { ...f, source_kind: "official_site" as SourceKind, confidence: 0.6 } : f)));
    }
  }

  // 2. OpenStreetMap around the pin
  if (thing.lat !== null && thing.lng !== null) {
    const around = await overpassAround(thing.lat, thing.lng, 150, c.fetch);
    if (around) {
      providers.push("overpass");
      const me = { lat: thing.lat, lng: thing.lng, name: thing.name };
      const match = around.find((e) => nearDuplicate(me, e)) ?? around.filter((e) => e.distance_m <= 60 && e.name).sort((a, b) => a.distance_m - b.distance_m)[0];
      if (match) facts.push(...osmFacts(match.tags, match));
      const nearby = around.filter((e) => e !== match && e.name && e.distance_m > 30).slice(0, 8).map((e) => ({ name: e.name, distance_m: Math.round(e.distance_m), kind: Object.entries(e.tags).find(([k]) => ["tourism", "leisure", "amenity", "historic", "natural", "shop"].includes(k))?.join("=") ?? null }));
      if (nearby.length) facts.push({ key: "nearby", value: nearby, source_url: null, source_kind: "osm", confidence: 0.6 });
    }
  }

  // 3. Google Place Details, counted against the monthly cap
  const placeId = ((c.runs.resolve.detail ?? {}) as Partial<ResolveDetail>).place_id ?? null;
  if (placeId && process.env.GOOGLE_MAPS_API_KEY && (await countGoogle(c.db, c.spaceId, "places"))) {
    const g = await googlePlaceDetails(placeId, process.env.GOOGLE_MAPS_API_KEY, c.fetch);
    if (g) {
      providers.push("google_places");
      facts.push(...g.facts);
    }
  }

  // 4. the web-search-grounded model, under the spend rule
  const gate = await paidGate(c.db, c.spaceId, new Date(c.now));
  let paidNote: string | null = null;
  if (gate.allowed) {
    const r = await webSearchFacts({ name: thing.name, address: thing.address, town: ((c.runs.read.detail ?? {}) as Partial<ReadDetail>).town ?? null, hint: c.drop.text }, { fetch: c.fetch as typeof fetch | undefined });
    if (r) {
      providers.push("web_search");
      cost += r.cost_pence;
      facts.push(...r.facts);
      await recordCost(c.db, c, "enrich", "web_search", r);
    }
  } else paidNote = gate.reason;

  const written = await upsertFacts(c.db, c.spaceId, thing.id, facts, c.now);
  const all = await factsFor(c.db, thing.id);
  const cols = foldFacts(thing, all);
  const { error } = await c.db
    .from("pm_things")
    .update({ ...cols, status: "ready", last_researched_at: iso(c.now), next_recheck_at: iso(c.now + RECHECK_DAYS * 86_400_000), updated_at: iso(c.now) })
    .eq("id", thing.id);
  if (error) throw new Error(`pm_things: ${error.message}`);
  c.thing = (await loadThing(c.db, c.spaceId, thing.id)) ?? thing;

  const detail = { providers, facts: written, folded: Object.keys(cols), web_search: gate.allowed ? "ran" : paidNote };
  if (paidNote === NOT_ALLOWED_REASON) return { status: "skipped", detail, provider: providers[0] ?? null, cost_pence: cost, error: NOT_ALLOWED_REASON };
  return { detail, provider: providers[0] ?? null, cost_pence: cost, error: paidNote };
};

// ---------------------------------------------------------------------------
// Stage: travel

const MODES: TravelMode[] = ["drive", "walk", "cycle"];

const travelStage: StageFn = async (c) => {
  const thing = c.thing;
  if (!thing) return { status: "skipped", error: "No thing yet" };
  if (thing.lat === null || thing.lng === null) return { status: "skipped", error: "The thing has no location yet" };
  const { data, error } = await c.db.from("pm_places").select("id, lat, lng, label").eq("space_id", c.spaceId).eq("saved", true).not("lat", "is", null).limit(50);
  if (error) throw new Error(`pm_places: ${error.message}`);
  const places = (data ?? []) as Array<{ id: string; lat: number; lng: number; label: string }>;
  const { data: haveRows } = await c.db.from("pm_travel").select("origin_place_id, mode, fetched_at").eq("thing_id", thing.id);
  const fresh = new Set(((haveRows ?? []) as Array<{ origin_place_id: string; mode: string; fetched_at: string }>).filter((r) => c.now - Date.parse(r.fetched_at) < TRAVEL_FRESH_DAYS * 86_400_000).map((r) => `${r.origin_place_id}:${r.mode}`));
  const googleKey = process.env.GOOGLE_MAPS_API_KEY ?? null;
  const orsKey = process.env.ORS_API_KEY ?? null;
  const modes: TravelMode[] = googleKey ? [...MODES, "transit"] : MODES;
  const counts: Record<string, number> = {};
  const rows: Record<string, unknown>[] = [];
  const to = { lat: thing.lat, lng: thing.lng };
  for (const place of places) {
    for (const mode of modes) {
      if (!c.force && fresh.has(`${place.id}:${mode}`)) continue;
      const useGoogle = googleKey ? await countGoogle(c.db, c.spaceId, "routes") : false;
      if (mode === "transit" && !useGoogle) continue;
      const r = await routeWithFallback({ lat: place.lat, lng: place.lng }, to, mode, { googleKey: useGoogle ? googleKey : null, orsKey, fetch: c.fetch, estimate: (km, m) => travelMinutes(km, m) ?? 0, now: c.now });
      counts[r.provider] = (counts[r.provider] ?? 0) + 1;
      rows.push({ space_id: c.spaceId, thing_id: thing.id, origin_place_id: place.id, mode, minutes: r.minutes, km: r.km, provider: r.provider, fetched_at: iso(c.now) });
    }
  }
  if (rows.length) {
    const up = await c.db.from("pm_travel").upsert(rows, { onConflict: "thing_id,origin_place_id,mode" });
    if (up.error) throw new Error(`pm_travel: ${up.error.message}`);
  }
  const provider = counts.google ? "google" : counts.ors ? "ors" : counts.estimate ? "estimate" : null;
  return { detail: { routes: rows.length, places: places.length, providers: counts, skipped_fresh: places.length * modes.length - rows.length }, provider };
};

// ---------------------------------------------------------------------------
// Stage: fit

const fitStage: StageFn = async (c) => {
  const thing = c.thing;
  if (!thing) return { status: "skipped", error: "No thing yet" };
  const r = await fitsForThing(c.db, c.spaceId, thing.id, { now: c.now });
  const counts = { fits: r.results.filter((x) => x.verdict === "fits").length, tight: r.results.filter((x) => x.verdict === "tight").length, no: r.results.filter((x) => x.verdict === "no").length };
  const next = r.next ? { text: r.next.text, arrive_at: r.next.result.arrive_at, leave_at: r.next.result.leave_at, verdict: r.next.result.verdict, reason: r.next.result.reason } : null;
  await upsertFacts(c.db, c.spaceId, thing.id, [{ key: "next_fit", value: next ?? { text: "no window in the next eight weeks", arrive_at: null, leave_at: null }, source_url: null, source_kind: "estimate", confidence: 0.5 }], c.now);
  return { detail: { next_text: next?.text ?? null, next, windows: r.results.length, ...counts }, provider: "engine" };
};

// ---------------------------------------------------------------------------
// Stage: notify

/** "Hackfall Woods — 55 min each way, about 3 h there, fits Sat 28 Nov." Pure; exported for tests. */
export function researchSentence(input: { name: string; eachWayMinutes: number | null; minMinutes: number | null; maxMinutes: number | null; nextFitText: string | null; matched?: boolean }): string {
  const parts: string[] = [];
  if (input.eachWayMinutes !== null) parts.push(`${formatDuration(input.eachWayMinutes)} each way`);
  if (input.minMinutes !== null || input.maxMinutes !== null) {
    const lo = input.minMinutes;
    const hi = input.maxMinutes;
    const mid = lo !== null && hi !== null ? (lo + hi) / 2 : (lo ?? hi) as number;
    parts.push(`about ${formatDuration(Math.round(mid / 15) * 15 || mid)} there`);
  }
  if (input.nextFitText) {
    const m = /^next (tight fit|fits): ([^,]+)/.exec(input.nextFitText);
    if (m) parts.push(m[1] === "fits" ? `fits ${m[2]}` : `a tight fit ${m[2]}`);
  } else parts.push("no window for it in the next eight weeks yet");
  const tail = parts.length ? parts.join(", ") : "researched";
  return `${input.name} — ${tail}.${input.matched ? " Already in your things." : ""}`;
}

const notifyStage: StageFn = async (c) => {
  const thing = c.thing;
  if (!thing) return { status: "skipped", error: "No thing yet" };
  const { data: person } = await c.db.from("pm_people").select("home_place_id").eq("space_id", c.spaceId).eq("person_id", c.drop.person_id).maybeSingle();
  const home = (person as { home_place_id: string | null } | null)?.home_place_id ?? null;
  let eachWay: number | null = null;
  if (home) {
    const { data: t } = await c.db.from("pm_travel").select("minutes, mode").eq("thing_id", thing.id).eq("origin_place_id", home).in("mode", ["drive", "transit"]).order("mode").limit(2);
    const drive = ((t ?? []) as Array<{ minutes: number; mode: string }>).find((x) => x.mode === "drive") ?? ((t ?? []) as Array<{ minutes: number }>)[0];
    eachWay = drive?.minutes ?? null;
  }
  const fitDetail = (c.runs.fit.detail ?? {}) as { next_text?: string | null };
  const matched = !!((c.runs.resolve.detail ?? {}) as Partial<ResolveDetail>).matched;
  const body = researchSentence({ name: thing.name, eachWayMinutes: eachWay, minMinutes: thing.min_minutes, maxMinutes: thing.max_minutes, nextFitText: fitDetail.next_text ?? null, matched });
  const r = await notifyPerson(c.db, c.spaceId, c.drop.person_id, { kind: "research_done", title: thing.name, body, url: `/phirstmaxx/things/${thing.id}`, thing_id: thing.id, drop_id: c.drop.id, counts: true }, new Date(c.now));
  return { detail: { body, sent_via: r.sent_via }, provider: r.sent_via ?? "inbox" };
};

export const DEFAULT_STAGES: StageTable = { read: readStage, resolve: resolveStage, enrich: enrichStage, travel: travelStage, fit: fitStage, notify: notifyStage };

// ---------------------------------------------------------------------------
// The walk

export type PipelineResult = { done: boolean; drop_id: string; stages: Record<ResearchStage, RunStatus>; waiting: boolean; retry: ResearchStage[] };

/**
 * One pass over a drop's stages. Throws at the end when a stage is failed
 * and retryable, so the queue brings the job back; otherwise returns what
 * each stage stands at.
 */
export async function runPipeline(db: SupabaseClient, payload: Payload, opts: { stages?: Partial<StageTable>; now?: number; fetch?: FetchLike } = {}): Promise<PipelineResult> {
  const now = opts.now ?? Date.now();
  const stages: StageTable = { ...DEFAULT_STAGES, ...(opts.stages ?? {}) };
  const spaceId = payload.space_id;
  const drop = await loadDrop(db, spaceId, payload.drop_id);
  if (!drop) throw new Error(`drop ${payload.drop_id} not found`);
  const runs = await ensureRuns(db, spaceId, drop.id);
  const thing = drop.thing_id ? await loadThing(db, spaceId, drop.thing_id) : null;
  const c: StageCtx = { db, spaceId, drop, runs, thing, now, force: !!payload.force, fetch: opts.fetch };

  for (const stage of RESEARCH_STAGES) {
    const run = runs[stage];
    const deps = STAGE_DEPS[stage].map((d) => runs[d]);
    const action = decideStage(run, deps, now, c.force);
    if (action === "skip" || action === "hold") continue;
    if (action === "blocked") {
      if (deps.some(deadEnd) && run.status !== "skipped") {
        const why = deps.find(deadEnd)!;
        runs[stage] = await saveRun(db, run, { status: "skipped", error: `${why.stage} did not finish: ${why.error ?? why.status}`, finished_at: iso(now) });
      }
      continue;
    }
    const started = await saveRun(db, run, { status: "running", started_at: iso(now), error: null, ...(c.force ? { attempts: 0 } : {}) });
    runs[stage] = started;
    try {
      const out = await stages[stage](c);
      runs[stage] = await saveRun(db, started, {
        status: out.status ?? "done",
        detail: { ...(started.detail ?? {}), ...(out.detail ?? {}) },
        provider: out.provider ?? started.provider,
        cost_pence: (started.cost_pence ?? 0) + Math.round(out.cost_pence ?? 0),
        error: out.error ?? null,
        finished_at: iso(now),
        ...(out.status === "waiting" ? { run_after: iso(now) } : {}),
      });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const attempts = started.attempts + 1;
      console.error(`[phirstmaxx/research] ${drop.id} ${stage} failed (${attempts}):`, message);
      runs[stage] = await saveRun(db, started, { status: "failed", attempts, error: message, finished_at: iso(now), run_after: iso(now + backoffMinutes(attempts) * MINUTE) });
    }
  }

  const retry = RESEARCH_STAGES.filter((s) => retryable(runs[s]));
  const waiting = RESEARCH_STAGES.some((s) => runs[s].status === "waiting");
  const result: PipelineResult = { done: retry.length === 0, drop_id: drop.id, stages: Object.fromEntries(RESEARCH_STAGES.map((s) => [s, runs[s].status])) as Record<ResearchStage, RunStatus>, waiting, retry };
  if (retry.length) throw new Error(`research for ${drop.id}: ${retry.map((s) => `${s} (${runs[s].error ?? "failed"})`).join("; ")}`);
  return result;
}

registerJobHandler(RESEARCH_JOB, {
  run: async (job: JobRow, db: SupabaseClient) => {
    const p = job.payload as Partial<Payload>;
    if (typeof p.space_id !== "string" || typeof p.drop_id !== "string") throw new Error("pm_research: payload needs space_id and drop_id");
    return runPipeline(db, { space_id: p.space_id, drop_id: p.drop_id, force: !!p.force }) as unknown as Promise<Record<string, unknown>>;
  },
  apply: async () => undefined,
  onGiveUp: async (job: JobRow, error: string, db: SupabaseClient) => {
    const p = job.payload as Partial<Payload>;
    if (typeof p.drop_id !== "string") return;
    await db.from("pm_research_runs").update({ error: `gave up: ${error}`.slice(0, 500), updated_at: new Date().toISOString() }).eq("drop_id", p.drop_id).in("status", ["queued", "running", "failed"]);
  },
});

// ---------------------------------------------------------------------------
// What the routes ask

export type ResearchStatus = { queue_depth: number; stuck: number; last_ok_by_source: Record<string, string | null>; month_cost_pence: number; paid_allowed: boolean; paid_reason: string | null };

/** The section's status line and the daily health check (spec §2.7). */
export async function researchStatus(db: SupabaseClient, spaceId: string, now: Date = new Date()): Promise<ResearchStatus> {
  const { data, error } = await db.from("pm_research_runs").select("stage, status, attempts, provider, started_at, finished_at, run_after, cost_pence, detail, updated_at").eq("space_id", spaceId).order("updated_at", { ascending: false }).limit(2000);
  if (error) throw new Error(`pm_research_runs: ${error.message}`);
  const rows = (data ?? []) as Array<RunRow & { updated_at: string }>;
  const t = now.getTime();
  let queue = 0;
  let stuck = 0;
  const last: Record<string, string | null> = {};
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  let month = 0;
  for (const r of rows) {
    if (r.status === "queued" || r.status === "running" || retryable(r)) queue += 1;
    if ((r.status === "failed" && r.attempts >= MAX_STAGE_ATTEMPTS) || (r.status === "running" && r.started_at && t - Date.parse(r.started_at) > 30 * MINUTE)) stuck += 1;
    if (Date.parse(r.updated_at) >= monthStart) month += Number(r.cost_pence || 0);
    if (r.status === "done" && r.finished_at) {
      const names = new Set<string>([...(r.provider ? [r.provider] : []), ...((Array.isArray(r.detail?.providers) ? (r.detail.providers as string[]) : []).map((p) => p.split(":")[0]))]);
      for (const n of names) if (!last[n] || last[n]! < r.finished_at) last[n] = r.finished_at;
    }
  }
  const paid = await paidGate(db, spaceId, now);
  return { queue_depth: queue, stuck, last_ok_by_source: last, month_cost_pence: Math.round(month), paid_allowed: paid.allowed, paid_reason: paid.reason };
}

/** The Re-research button: every drop of the thing goes back through the pipeline, done stages included. */
export async function rerunResearch(db: SupabaseClient, spaceId: string, thingId: string): Promise<{ drops: number }> {
  const { data, error } = await db.from("pm_drops").select("id").eq("space_id", spaceId).eq("thing_id", thingId).limit(50);
  if (error) throw new Error(`pm_drops: ${error.message}`);
  const ids = ((data ?? []) as Array<{ id: string }>).map((d) => d.id);
  for (const id of ids) await startResearch(db, spaceId, id, { force: true });
  return { drops: ids.length };
}

/** The one question answered: the name is kept on the drop and as a fact, and research carries on from it. */
export async function answerQuestion(db: SupabaseClient, spaceId: string, dropId: string, answer: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const text = (answer ?? "").trim().slice(0, 200);
  if (!text) return { ok: false, status: 400, error: "An answer is needed." };
  const drop = await loadDrop(db, spaceId, dropId);
  if (!drop) return { ok: false, status: 404, error: "No such drop." };
  const { error } = await db.from("pm_drops").update({ answer: text, question: null }).eq("id", drop.id);
  if (error) return { ok: false, status: error.code === "42501" ? 403 : 400, error: error.message };
  if (drop.thing_id) {
    await upsertFacts(db, spaceId, drop.thing_id, [{ key: "name", value: text, source_url: null, source_kind: "person", confidence: 1 }]);
    await db.from("pm_things").update({ name: text, status: "researching", updated_at: new Date().toISOString() }).eq("id", drop.thing_id).eq("status", "needs_answer");
  }
  await db.from("pm_research_runs").update({ status: "queued", error: null, run_after: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("drop_id", drop.id).eq("status", "waiting");
  await startResearch(db, spaceId, drop.id, { force: true });
  return { ok: true };
}
