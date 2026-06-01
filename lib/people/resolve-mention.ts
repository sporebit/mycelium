import { createServerClient } from "@/lib/supabase/server";
import { aliasKey, boundedLevenshtein, normaliseAlias } from "./normalise";
import type { MentionResolution } from "./types";

type Supabase = ReturnType<typeof createServerClient>;

/**
 * Resolve a raw alias (e.g. "Luke", "my mum") to a person.
 *
 * Algorithm:
 *  1. Exact case-insensitive match against people_aliases.alias
 *     - 1 hit → high confidence
 *     - 2+ hits → ambiguous, needs_review
 *  2. Fuzzy (Levenshtein ≤ 2) against all aliases for this user
 *     - 1 hit → medium
 *     - 2+ hits → low (and treated as ambiguous in practice)
 *  3. No match → auto-create a new person with needs_review, primary alias = raw
 */
export async function resolveMention(
  supabase: Supabase,
  userId: string,
  rawAliasIn: string,
  /** When set, skip the no-match auto-create branch and return an
   *  unresolved result. Callers (voice/Telegram capture pipeline)
   *  use this to enqueue a pending_entities row for human review
   *  instead of silently creating a new person. */
  opts: { deferIfNew?: boolean } = {},
): Promise<MentionResolution> {
  const rawAlias = normaliseAlias(rawAliasIn);
  if (!rawAlias) {
    return {
      raw_alias: rawAliasIn,
      person_id: null,
      candidate_person_ids: [],
      confidence: "unresolved",
      auto_created: false,
      needs_review: false,
    };
  }

  const key = aliasKey(rawAlias);

  // 1. Exact match
  const { data: exact } = await supabase
    .from("people_aliases")
    .select("person_id, alias, people:person_id!inner(user_id)")
    .ilike("alias", rawAlias);
  type Row = {
    person_id: string;
    alias: string;
    people: { user_id: string } | { user_id: string }[];
  };
  const exactRows: Row[] = (exact ?? []) as Row[];
  // Filter rows by the user (joined people)
  const ownExact: { person_id: string; alias: string }[] = exactRows
    .map((r) => {
      const j = Array.isArray(r.people) ? r.people[0] : r.people;
      return j?.user_id === userId
        ? { person_id: r.person_id, alias: r.alias }
        : null;
    })
    .filter((r): r is { person_id: string; alias: string } => r !== null);

  // Unique by person_id
  const uniquePersonIds = Array.from(new Set(ownExact.map((r) => r.person_id)));
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

  // 2. Fuzzy. Pull all aliases for this user and Levenshtein them.
  const { data: allAliases } = await supabase
    .from("people_aliases")
    .select("person_id, alias, people:person_id!inner(user_id)");
  const allRows: Row[] = (allAliases ?? []) as Row[];
  const ownAll: { person_id: string; alias: string }[] = allRows
    .map((r) => {
      const j = Array.isArray(r.people) ? r.people[0] : r.people;
      return j?.user_id === userId
        ? { person_id: r.person_id, alias: r.alias }
        : null;
    })
    .filter((r): r is { person_id: string; alias: string } => r !== null);

  const fuzzyHits = new Map<string, number>(); // person_id → best distance
  for (const r of ownAll) {
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

  // 3. No match — auto-create, unless the caller asked to defer
  // (voice/Telegram captures route through pending_entities instead).
  if (opts.deferIfNew) {
    return {
      raw_alias: rawAlias,
      person_id: null,
      candidate_person_ids: [],
      confidence: "unresolved",
      auto_created: false,
      needs_review: true,
    };
  }
  const { data: created, error: createErr } = await supabase
    .from("people")
    .insert({
      user_id: userId,
      first_name: rawAlias,
      needs_review: true,
    })
    .select("id")
    .single();
  if (createErr || !created) {
    return {
      raw_alias: rawAlias,
      person_id: null,
      candidate_person_ids: [],
      confidence: "unresolved",
      auto_created: false,
      needs_review: false,
    };
  }
  await supabase.from("people_aliases").insert({
    person_id: created.id,
    alias: rawAlias,
    is_primary: true,
  });
  return {
    raw_alias: rawAlias,
    person_id: created.id as string,
    candidate_person_ids: [created.id as string],
    confidence: "unresolved",
    auto_created: true,
    needs_review: true,
  };
}

/** Insert a people_mentions row from a resolution + source identifiers. */
export async function recordMention(
  supabase: Supabase,
  userId: string,
  resolution: MentionResolution,
  source: { type: "capture" | "task" | "journal"; id: string }
): Promise<void> {
  try {
    await supabase.from("people_mentions").insert({
      user_id: userId,
      person_id: resolution.person_id,
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
