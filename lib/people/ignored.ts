/**
 * The learned ignore list (people-review R4, 0149): terms that are never
 * people. Exact, case-insensitive match on `aliasKey()` only — no fuzzy,
 * so ignoring "Smoke" never kills "Smokey". Checked in the regex
 * extractor's output, in `resolveMention()` before the fuzzy step, before
 * any pending person row is queued, and as a post-filter on the
 * classifier's mentions. Every write here is soft: a failure is logged and
 * never blocks the save that triggered it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { aliasKey, normaliseAlias } from "./normalise";

export type IgnoredSource = "reject" | "manual" | "pending";

export type IgnoredTerm = {
  id: string;
  term_key: string;
  term_raw: string;
  source: IgnoredSource;
  person_id: string | null;
  created_at: string;
  space_id?: string | null;
};

export const IGNORED_SELECT = "id, term_key, term_raw, source, person_id, created_at, space_id";

/** Every ignored key the caller can see, as a Set for O(1) checks. */
export async function ignoredTermKeys(db: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await db.from("people_ignored_terms").select("term_key");
  if (error) {
    console.error("[people_ignored_terms] read failed:", error.message);
    return new Set();
  }
  return new Set(((data ?? []) as Array<{ term_key: string }>).map((r) => r.term_key));
}

export async function isIgnoredTerm(db: SupabaseClient, term: string): Promise<boolean> {
  const key = aliasKey(term);
  if (!key) return false;
  const { data } = await db.from("people_ignored_terms").select("id").eq("term_key", key).limit(1).maybeSingle();
  return !!data;
}

export async function listIgnoredTerms(db: SupabaseClient): Promise<IgnoredTerm[]> {
  const { data, error } = await db.from("people_ignored_terms").select(IGNORED_SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as IgnoredTerm[];
}

/**
 * Add terms to the list. Duplicates (same key in the same space) are kept
 * as they were — the first reason wins. Returns how many were new.
 */
export async function addIgnoredTerms(
  db: SupabaseClient,
  terms: string[],
  source: IgnoredSource,
  personId: string | null = null,
): Promise<number> {
  const rows = new Map<string, { term_key: string; term_raw: string; source: IgnoredSource; person_id: string | null }>();
  for (const t of terms) {
    const raw = normaliseAlias(t);
    const key = aliasKey(raw);
    if (!key || rows.has(key)) continue;
    rows.set(key, { term_key: key, term_raw: raw, source, person_id: personId });
  }
  if (rows.size === 0) return 0;
  const { data, error } = await db
    .from("people_ignored_terms")
    .upsert(Array.from(rows.values()), { onConflict: "space_id,term_key", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[people_ignored_terms] add failed:", error.message);
    return 0;
  }
  invalidateIgnoredCache();
  return (data ?? []).length;
}

export async function removeIgnoredTerm(db: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await db.from("people_ignored_terms").delete().eq("id", id);
  if (!error) invalidateIgnoredCache();
  return !error;
}

/** Restoring a rejected person from the bin takes their words off the list (R2). */
export async function removeIgnoredForPerson(db: SupabaseClient, personId: string): Promise<number> {
  const { data, error } = await db.from("people_ignored_terms").delete().eq("person_id", personId).select("id");
  if (error) {
    console.error("[people_ignored_terms] remove-for-person failed:", error.message);
    return 0;
  }
  invalidateIgnoredCache();
  return (data ?? []).length;
}

/** Drop every extraction / mention whose key is on the list. */
export function filterIgnored<T extends { name_hint?: string; raw: string }>(items: T[], ignored: Set<string>): T[] {
  if (ignored.size === 0) return items;
  return items.filter((m) => !ignored.has(aliasKey(m.name_hint || m.raw)));
}

// ---------------------------------------------------------------------------
// the classifier hint (R5): the most recent ~100 terms, cached a minute
// ---------------------------------------------------------------------------

const PROMPT_TERMS = 100;
const TTL_MS = 60_000;
type CacheEntry = { block: string; keys: Set<string>; ts: number };
/** Per user, like the few-shot cache: one user's words never reach another's prompt. */
const cache = new Map<string, CacheEntry>();

export function invalidateIgnoredCache(userId?: string): void {
  if (!userId) cache.clear();
  else cache.delete(userId);
}

/**
 * The prompt block ("these are never people") and the full key set for the
 * post-filter. The prompt is a hint; the filter is the guarantee.
 */
export async function ignoredForClassifier(db: SupabaseClient, userId: string): Promise<{ block: string; keys: Set<string> }> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit;
  let block = "";
  let keys = new Set<string>();
  try {
    const { data, error } = await db
      .from("people_ignored_terms")
      .select("term_key, term_raw")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as Array<{ term_key: string; term_raw: string }>;
    keys = new Set(rows.map((r) => r.term_key));
    const recent = rows.slice(0, PROMPT_TERMS).map((r) => r.term_raw);
    if (recent.length) {
      block = `These words and phrases are never people for this user — do not return them as mentions:\n${recent.map((t) => `  - ${JSON.stringify(t)}`).join("\n")}`;
    }
  } catch (err) {
    console.error("[people_ignored_terms] classifier fetch failed:", err);
  }
  const entry = { block, keys, ts: Date.now() };
  cache.set(userId, entry);
  return entry;
}
