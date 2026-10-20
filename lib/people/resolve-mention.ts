import type { SupabaseClient } from "@supabase/supabase-js";
import { aliasKey, boundedLevenshtein, normaliseAlias } from "./normalise";
import { isIgnoredTerm } from "./ignored";
import type { MentionResolution } from "./types";

type Supabase = SupabaseClient;

/** Only live, unarchived persons match a mention: never a contact (people-contacts C1), a deleted person (C4) or an archived one (people-review R3). */
const LIVE_ALIAS_SELECT = "person_id, alias, people!inner(tier, deleted_at, archived_at)";

function unresolved(rawAlias: string, extra: Partial<MentionResolution> = {}): MentionResolution {
  return {
    raw_alias: rawAlias,
    person_id: null,
    candidate_person_ids: [],
    confidence: "unresolved",
    auto_created: false,
    needs_review: false,
    ...extra,
  };
}

/**
 * Resolve a raw alias (e.g. "Luke", "my mum") to a person.
 *
 * Algorithm:
 *  1. Exact case-insensitive match against people_aliases.alias
 *     - 1 hit → high confidence
 *     - 2+ hits → ambiguous, needs_review
 *  2. The term is on the ignore list, or is an archived person's alias →
 *     unresolved and `suppressed` (callers queue nothing)
 *  3. Fuzzy (Levenshtein ≤ 2) against all live aliases
 *     - 1 hit → medium
 *     - 2+ hits → low (and treated as ambiguous in practice)
 *  4. No match → unresolved. **No path creates a person** (people-review
 *     R1): the caller queues a pending_entities row with
 *     `queuePendingPerson()` and the review queue decides.
 */
export async function resolveMention(
  supabase: Supabase,
  rawAliasIn: string,
): Promise<MentionResolution> {
  const rawAlias = normaliseAlias(rawAliasIn);
  if (!rawAlias) return unresolved(rawAliasIn);

  const key = aliasKey(rawAlias);

  // 1. Exact match among live, unarchived persons.
  const { data: exact } = await supabase
    .from("people_aliases")
    .select(LIVE_ALIAS_SELECT)
    .eq("people.tier", "person")
    .is("people.deleted_at", null)
    .is("people.archived_at", null)
    .ilike("alias", rawAlias);
  type Row = {
    person_id: string;
    alias: string;
  };
  const exactRows: Row[] = (exact ?? []) as Row[];

  // Unique by person_id
  const uniquePersonIds = Array.from(new Set(exactRows.map((r) => r.person_id)));
  if (uniquePersonIds.length === 1) {
    return {
      raw_alias: rawAlias,
      person_id: uniquePersonIds[0],
      candidate_person_ids: uniquePersonIds,
      confidence: "high",
      auto_created: false,
      needs_review: false,
    };
  }
  if (uniquePersonIds.length > 1) {
    return {
      raw_alias: rawAlias,
      person_id: null,
      candidate_person_ids: uniquePersonIds,
      confidence: "ambiguous",
      auto_created: false,
      needs_review: true,
    };
  }

  // 2. Suppressed: on the ignore list (R4), or the alias of an archived
  //    person (R3's flag: "Nath" archived must not come back as a new
  //    suggestion on the next mention). Checked before the fuzzy step so
  //    an ignored "Smoke" still lets "Smokey" fuzzy-match.
  if (await isIgnoredTerm(supabase, key)) return unresolved(rawAlias, { suppressed: "ignored" });
  const { data: archived } = await supabase
    .from("people_aliases")
    .select("person_id, people!inner(archived_at, deleted_at)")
    .not("people.archived_at", "is", null)
    .is("people.deleted_at", null)
    .ilike("alias", rawAlias)
    .limit(1);
  if ((archived ?? []).length > 0) return unresolved(rawAlias, { suppressed: "archived" });

  // 3. Fuzzy. Pull all live aliases for this user and Levenshtein them.
  const { data: allAliases } = await supabase
    .from("people_aliases")
    .select(LIVE_ALIAS_SELECT)
    .eq("people.tier", "person")
    .is("people.deleted_at", null)
    .is("people.archived_at", null);
  const allRows: Row[] = (allAliases ?? []) as Row[];

  const fuzzyHits = new Map<string, number>(); // person_id → best distance
  for (const r of allRows) {
    const d = boundedLevenshtein(key, aliasKey(r.alias), 2);
    if (d <= 2) {
      const prev = fuzzyHits.get(r.person_id);
      if (prev === undefined || d < prev) fuzzyHits.set(r.person_id, d);
    }
  }
  const fuzzyIds = Array.from(fuzzyHits.keys());
  if (fuzzyIds.length === 1) {
    return {
      raw_alias: rawAlias,
      person_id: fuzzyIds[0],
      candidate_person_ids: fuzzyIds,
      confidence: "medium",
      auto_created: false,
      needs_review: false,
    };
  }
  if (fuzzyIds.length > 1) {
    return {
      raw_alias: rawAlias,
      person_id: null,
      candidate_person_ids: fuzzyIds,
      confidence: "low",
      auto_created: false,
      needs_review: true,
    };
  }

  // 4. No match. The pending_entities row is the review item, so the
  //    mention row itself is not flagged (needs_review false): one queue
  //    entry per unknown name, not two.
  return unresolved(rawAlias);
}

/**
 * An unknown name becomes one `pending_entities` row (kind person) for
 * the review queue — never a person (R1). Nothing is queued when the
 * resolution matched, was suppressed, or an unresolved row for the same
 * wording is already waiting (a ticket rebuilds its mentions on every
 * save). Returns the pending row id when one was written.
 */
export async function queuePendingPerson(
  supabase: Supabase,
  resolution: MentionResolution,
  source: {
    /** The capture the name came from, when there is one. */
    captureId?: string | null;
    /** What produced it, and the words around it, for the review card. */
    sourceKind: string;
    snippet?: string | null;
    ticketId?: string | null;
    ticketKey?: string | null;
  },
): Promise<string | null> {
  if (resolution.person_id || resolution.suppressed) return null;
  if (resolution.confidence !== "unresolved" || resolution.candidate_person_ids.length > 0) return null;
  const name = resolution.raw_alias;
  if (!name) return null;
  try {
    const { data: existing } = await supabase
      .from("pending_entities")
      .select("id")
      .eq("entity_type", "person")
      .is("resolved_at", null)
      .ilike("entity_name", name)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return null;
    const additional: Record<string, unknown> = { source_kind: source.sourceKind };
    if (source.snippet) additional.snippet = source.snippet.slice(0, 240);
    if (source.ticketId) additional.ticket_id = source.ticketId;
    if (source.ticketKey) additional.ticket_key = source.ticketKey;
    const { data, error } = await supabase
      .from("pending_entities")
      .insert({
        capture_id: source.captureId ?? null,
        entity_type: "person",
        entity_name: name,
        additional_data: additional,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data?.id as string) ?? null;
  } catch (err) {
    console.error("[queuePendingPerson]", err);
    return null;
  }
}

/** Insert a people_mentions row from a resolution + source identifiers. A suppressed resolution records nothing. */
export async function recordMention(
  supabase: Supabase,
  resolution: MentionResolution,
  source: { type: "capture" | "task" | "journal"; id: string }
): Promise<void> {
  if (resolution.suppressed) return;
  try {
    await supabase.from("people_mentions").insert({ person_id: resolution.person_id,
      source_type: source.type,
      source_id: source.id,
      raw_alias: resolution.raw_alias,
      confidence: resolution.confidence,
      candidate_person_ids:
        resolution.candidate_person_ids.length > 0
          ? resolution.candidate_person_ids
          : null,
      needs_review: resolution.needs_review,
    });

    // Auto-clear needs_review on the person once they've collected ≥3 mentions
    // (per spec — at that point they're clearly a real person).
    if (resolution.person_id && !resolution.needs_review) {
      const { count } = await supabase
        .from("people_mentions")
        .select("id", { count: "exact", head: true })
        .eq("person_id", resolution.person_id);
      if ((count ?? 0) >= 3) {
        await supabase
          .from("people")
          .update({ needs_review: false, updated_at: new Date().toISOString() })
          .eq("id", resolution.person_id)
          .eq("needs_review", true);
      }
    }
  } catch (err) {
    // Soft failure — capture/task/journal save isn't blocked by mention failures.
    console.error("[recordMention]", err);
  }
}
