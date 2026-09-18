/**
 * Quotes — server helpers (spec §3, §4, §6). Person resolution by alias
 * (never auto-creates a person: zero or many matches stay unresolved and
 * the review card offers the picker), near-duplicate lookup, and the
 * single insert path shared by the review approve, the manual POST and
 * the reroute branch. Research is kicked separately (research.ts) so the
 * caller decides between `after()` and the sweeper.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseAlias } from "@/lib/people/normalise";
import { DUPLICATE_THRESHOLD, parseRelativeSaidAt, similarity, type QuoteExtraction } from "./text";

export const QUOTE_SELECT =
  "id, text, raw_text, said_by_person_id, is_own, speaker_confidence, context, source, said_at, merch, attributed_to, research_status, research, research_ran_at, capture_id, created_at, updated_at, person:people(id, display_name, first_name, last_name)";

export type QuoteRow = {
  id: string;
  text: string;
  raw_text: string | null;
  said_by_person_id: string | null;
  is_own: boolean;
  speaker_confidence: "certain" | "uncertain";
  context: string | null;
  source: string | null;
  said_at: string;
  merch: boolean;
  attributed_to: string | null;
  research_status: "pending" | "running" | "found" | "none" | "skipped" | "failed" | "wrong";
  research: Record<string, unknown> | null;
  research_ran_at: string | null;
  capture_id: string | null;
  created_at: string;
  updated_at: string;
  person: { id: string; display_name: string | null; first_name: string | null; last_name: string | null } | { id: string; display_name: string | null; first_name: string | null; last_name: string | null }[] | null;
};

export function personName(p: QuoteRow["person"]): string | null {
  const one = Array.isArray(p) ? (p[0] ?? null) : p;
  if (!one) return null;
  return one.display_name ?? [one.first_name, one.last_name].filter(Boolean).join(" ") ?? null;
}

/** Zero or many alias matches → null (the review picker handles it). */
export async function resolveSpeaker(db: SupabaseClient, speaker: string | null): Promise<{ person_id: string | null; candidates: string[] }> {
  const alias = normaliseAlias(speaker ?? "");
  if (!alias) return { person_id: null, candidates: [] };
  const { data } = await db.from("people_aliases").select("person_id").ilike("alias", alias);
  const ids = Array.from(new Set((data ?? []).map((r) => (r as { person_id: string }).person_id)));
  return { person_id: ids.length === 1 ? ids[0] : null, candidates: ids };
}

/** Near-duplicates in the caller's visible quotes (RLS scopes the read). */
export async function findSimilar(db: SupabaseClient, text: string, excludeId?: string | null): Promise<Array<{ id: string; text: string; score: number }>> {
  const { data } = await db.from("quotes").select("id, text").order("created_at", { ascending: false }).limit(500);
  return ((data ?? []) as Array<{ id: string; text: string }>)
    .filter((q) => q.id !== excludeId)
    .map((q) => ({ id: q.id, text: q.text, score: similarity(text, q.text) }))
    .filter((q) => q.score > DUPLICATE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export type CreateQuoteInput = {
  text: string;
  raw_text?: string | null;
  said_by_person_id?: string | null;
  is_own?: boolean;
  speaker_confidence?: "certain" | "uncertain";
  context?: string | null;
  source?: string | null;
  said_at?: string | null;
  merch?: boolean;
  capture_id?: string | null;
  /** decision 16: likely_original → research skipped */
  likely_original?: boolean;
  skip_research?: boolean;
};

export async function createQuote(db: SupabaseClient, input: CreateQuoteInput): Promise<QuoteRow> {
  const is_own = input.is_own === true || !input.said_by_person_id && input.is_own !== false;
  const row = {
    text: input.text.trim(),
    raw_text: input.raw_text ?? null,
    said_by_person_id: is_own ? null : (input.said_by_person_id ?? null),
    is_own,
    speaker_confidence: input.speaker_confidence ?? "certain",
    context: input.context ?? null,
    source: input.source ?? null,
    said_at: input.said_at ?? new Date().toISOString(),
    merch: input.merch === true,
    capture_id: input.capture_id ?? null,
    research_status: input.skip_research || input.likely_original ? "skipped" : "pending",
  };
  const { data, error } = await db.from("quotes").insert(row).select(QUOTE_SELECT).single();
  if (error || !data) throw new Error(`quotes insert failed: ${error?.message ?? "no row"}`);
  return data as unknown as QuoteRow;
}

/** From a classifier extraction (review approve / reroute): resolve the speaker, parse said_at. */
export async function createQuoteFromExtraction(
  db: SupabaseClient,
  ex: QuoteExtraction,
  opts: { raw_text: string; capture_id: string; said_by_person_id?: string | null; is_own?: boolean },
): Promise<QuoteRow> {
  const resolved = opts.said_by_person_id !== undefined ? { person_id: opts.said_by_person_id } : await resolveSpeaker(db, ex.is_own ? null : ex.speaker);
  const is_own = opts.is_own ?? (ex.is_own || !resolved.person_id);
  return createQuote(db, {
    text: ex.text,
    raw_text: opts.raw_text,
    said_by_person_id: is_own ? null : resolved.person_id,
    is_own,
    speaker_confidence: !is_own && !resolved.person_id ? "uncertain" : ex.speaker_confidence,
    context: ex.context,
    source: ex.source,
    said_at: parseRelativeSaidAt(ex.said_at_relative),
    capture_id: opts.capture_id,
    likely_original: ex.likely_original,
  });
}

export function extractionFromClassification(c: Record<string, unknown>): QuoteExtraction {
  const q = (c.quote as Record<string, unknown> | null | undefined) ?? {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const text = str(q.text) ?? str(c.title) ?? "";
  const speaker = str(q.speaker);
  return {
    text,
    speaker,
    is_own: q.is_own === true || (!speaker && q.is_own !== false),
    speaker_confidence: q.speaker_confidence === "uncertain" ? "uncertain" : "certain",
    context: str(q.context),
    said_at_relative: str(q.said_at_relative),
    source: str(q.source),
    likely_original: q.likely_original !== false,
  };
}
