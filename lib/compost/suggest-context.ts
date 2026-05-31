import type { SupabaseClient } from "@supabase/supabase-js";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been",
  "being","have","has","had","do","does","did","will","would","could",
  "should","may","might","must","can","i","you","he","she","it","we",
  "they","my","your","his","her","its","our","their","this","that","these",
  "those","what","which","who","whom","whose","when","where","why","how",
  "to","of","in","on","at","for","by","with","from","into","onto","up",
  "down","out","off","over","under","again","then","once","very","just",
  "really","also","get","got","make","made","go","going","need","needs",
  "want","wants","like","there","here","than","more","less","not","no",
  "yes","ok","please","thanks","thank","one","two","three","four","five",
]);

function tokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

type ContextRow = {
  title: string | null;
  context_where: string | null;
  context_device: string | null;
  context_energy: "low" | "medium" | "high" | null;
  context_tag: string | null;
};

/**
 * Suggest context_where / device / energy / tag for a brand-new task
 * by looking at the user's past tasks whose titles share at least 50%
 * of their significant tokens with the new title.
 *
 * A value is suggested only when ≥3 matching past tasks agree on it,
 * which keeps the floor at "saw it work three times". Anything below
 * that returns null so the UI can default to user-set or
 * voice-classified values without overruling them.
 */
export async function suggestContext(
  supabase: SupabaseClient,
  userId: string,
  title: string,
): Promise<{
  where: string | null;
  device: string | null;
  energy: "low" | "medium" | "high" | null;
  tag: string | null;
}> {
  const empty = { where: null, device: null, energy: null, tag: null };
  const tk = tokens(title);
  if (tk.length === 0) return empty;
  const tkSet = new Set(tk);

  // Pull recent tasks (cap to avoid scanning the whole history) with
  // any context set.
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "title, context_where, context_device, context_energy, context_tag",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or(
      "context_where.not.is.null,context_device.not.is.null,context_energy.not.is.null,context_tag.not.is.null",
    )
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error || !data) return empty;

  const matches: ContextRow[] = [];
  for (const row of data as ContextRow[]) {
    if (!row.title) continue;
    const otherTokens = tokens(row.title);
    if (otherTokens.length === 0) continue;
    let overlap = 0;
    for (const t of otherTokens) if (tkSet.has(t)) overlap += 1;
    const ratio = overlap / Math.max(otherTokens.length, tk.length);
    if (ratio >= 0.5) matches.push(row);
  }

  if (matches.length < 3) return empty;

  function modal<T extends string | null>(values: T[]): T | null {
    const counts = new Map<string, number>();
    for (const v of values) {
      if (v == null) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best: { v: string; c: number } | null = null;
    for (const [v, c] of counts) {
      if (!best || c > best.c) best = { v, c };
    }
    // Require ≥30% confidence and ≥3 votes.
    if (!best || best.c < 3) return null;
    if (best.c / matches.length < 0.3) return null;
    return best.v as T;
  }

  return {
    where: modal(matches.map((m) => m.context_where)),
    device: modal(matches.map((m) => m.context_device)),
    energy: modal(matches.map((m) => m.context_energy)) as
      | "low"
      | "medium"
      | "high"
      | null,
    tag: modal(matches.map((m) => m.context_tag)),
  };
}
