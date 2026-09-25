/**
 * Capture learning (MYC-161). One row per capture in `capture_learning`
 * (0138): what the classifier predicted, what the user chose on the typed
 * form, and what was approved in review (or accepted from the Tickets
 * Inbox). The corrections feed back into the classifier prompt as few-shot
 * examples through `buildFewShotBlock`.
 *
 * Every write here is soft: a failure is logged and never blocks a capture.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type LearningInsert = {
  captureId: string;
  text: string;
  source: string;
  predictedKind?: string | null;
  predictedFields?: Record<string, unknown> | null;
  predictedLlmSource?: string | null;
  chosenKind?: string | null;
  chosenFields?: Record<string, unknown> | null;
};

const TEXT_LIMIT = 400;

/** The classifier's per-kind detail object (purchase, reminder, …) plus the shared fields, as "predicted fields". */
export function fieldsFromClassification(c: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!c) return {};
  const out: Record<string, unknown> = {};
  for (const k of ["title", "summary", "urgency", "key", "tags", "mood", "entity_name", "purchase", "pain", "reminder", "media", "account", "quote", "context_where", "context_device", "context_energy", "context_tag"]) {
    const v = c[k];
    if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && v !== "") out[k] = v;
  }
  return out;
}

export async function recordCaptureLearning(db: SupabaseClient, row: LearningInsert): Promise<void> {
  const { error } = await db.from("capture_learning").upsert(
    {
      capture_id: row.captureId,
      text: row.text.slice(0, TEXT_LIMIT),
      source: row.source,
      predicted_kind: row.predictedKind ?? null,
      predicted_fields: row.predictedFields ?? null,
      predicted_llm_source: row.predictedLlmSource ?? null,
      chosen_kind: row.chosenKind ?? null,
      chosen_fields: row.chosenFields ?? null,
    },
    { onConflict: "capture_id" },
  );
  if (error) console.error("[capture_learning] insert failed:", error.message);
}

/** The shadow classification of a typed capture (api_usage tag capture.shadow) lands here. */
export async function recordPrediction(
  db: SupabaseClient,
  captureId: string,
  classification: Record<string, unknown>,
  llmSource: string,
): Promise<void> {
  const { error } = await db
    .from("capture_learning")
    .update({
      predicted_kind: typeof classification.kind === "string" ? classification.kind : null,
      predicted_fields: fieldsFromClassification(classification),
      predicted_llm_source: llmSource,
      updated_at: new Date().toISOString(),
    })
    .eq("capture_id", captureId);
  if (error) console.error("[capture_learning] prediction update failed:", error.message);
}

/** Review APPROVE (or a re-route): the kind and fields the user settled on. */
export async function recordApproval(
  db: SupabaseClient,
  captureId: string,
  kind: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from("capture_learning")
    .update({ approved_kind: kind, approved_fields: fields, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("capture_id", captureId);
  if (error) console.error("[capture_learning] approval update failed:", error.message);
}

/**
 * A ticket leaving the Inbox is the approval for the ticket path: the
 * capture that made it (routed_to = tickets) gets the ticket's settled fields.
 */
export async function recordTicketApproval(db: SupabaseClient, ticketId: string): Promise<void> {
  try {
    const { data: cap } = await db.from("raw_captures").select("id").eq("routed_to", "tickets").eq("routed_id", ticketId).maybeSingle();
    if (!cap?.id) return;
    const { data: t } = await db
      .from("tickets")
      .select("title, description, due_window, deadline_on, project_id, where_ctx, tools, time_window, points, key, tags")
      .eq("id", ticketId)
      .maybeSingle();
    if (!t) return;
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) fields[k] = v;
    await recordApproval(db, cap.id, t.project_id ? "ticket" : "task", fields);
  } catch (err) {
    console.error("[capture_learning] ticket approval soft-fail:", err);
  }
}

// ---------------------------------------------------------------------------
// few-shot corrections for the classifier prompt
// ---------------------------------------------------------------------------

type CacheEntry = { block: string; ts: number };
const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export function invalidateFewShotCache(userId?: string): void {
  if (!userId) cache.clear();
  else cache.delete(userId);
}

/** Review-only kinds map onto what the classifier can say. */
function classifierKind(kind: string | null): string | null {
  if (!kind) return null;
  if (kind === "ticket") return "task";
  if (kind === "person") return null;
  return kind;
}

const MAX_EXAMPLES = 8;

/**
 * "Recent corrections": captures where what the user chose or approved
 * differs from what the classifier predicted. Newest first, capped, cached
 * for a minute like the routing rules. Empty string when there are none.
 */
export async function buildFewShotBlock(db: SupabaseClient, userId: string): Promise<string> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.block;
  let block = "";
  try {
    const { data, error } = await db
      .from("capture_learning")
      .select("text, predicted_kind, chosen_kind, approved_kind, updated_at")
      .or("approved_kind.not.is.null,chosen_kind.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const r of (data ?? []) as Array<{ text: string; predicted_kind: string | null; chosen_kind: string | null; approved_kind: string | null }>) {
      const final = classifierKind(r.approved_kind ?? r.chosen_kind);
      const predicted = classifierKind(r.predicted_kind);
      if (!final || !predicted || final === predicted) continue;
      const text = (r.text ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      lines.push(`  - ${JSON.stringify(text)} -> ${final} (not ${predicted})`);
      if (lines.length >= MAX_EXAMPLES) break;
    }
    if (lines.length) {
      block = `Recent corrections from this user — when a new message looks like one of these, use the kind they chose:\n${lines.join("\n")}`;
    }
  } catch (err) {
    console.error("[capture_learning] few-shot fetch failed:", err);
  }
  cache.set(userId, { block, ts: Date.now() });
  return block;
}
