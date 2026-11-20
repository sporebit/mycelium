/**
 * The seven-day rule (Phil, 2026-11-20; research rule 20): a capture's card
 * left unanswered for seven days files itself with the AI's guess and is
 * tagged "unreviewed". The review queue can therefore never grow without
 * limit, and coming back after a gap never means a backlog of cards
 * (research rule 2).
 *
 *   A single capture was already filed with the guess when it arrived, so
 *   filing itself means: its card leaves the queue, the capture is marked
 *   `unreviewed`, and a ticket it made gets the tag so it can be found.
 *   An item held from a split dump was never filed; it stays what it was
 *   promised to be, an idea, and is not turned into a commitment because
 *   nobody looked (research rule 19).
 *
 * `db` acts as the person whose cards these are.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const AUTO_FILE_DAYS = 7;
export const UNREVIEWED_TAG = "unreviewed";

type Waiting = { id: string; classification: Record<string, unknown> | null; routed_to: string | null; routed_id: string | null; processed_at: string | null };

export type AutoFileResult = { filed: number; ideas: number; tagged: number };

export async function autoFileStale(db: SupabaseClient, opts: { now?: Date; limit?: number } = {}): Promise<AutoFileResult> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - AUTO_FILE_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("raw_captures")
    .select("id, classification, routed_to, routed_id, processed_at")
    .is("reviewed_at", null)
    .is("discarded_at", null)
    .is("deleted_at", null)
    .is("auto_filed_at", null)
    .eq("status", "processed")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 500);
  if (error) throw new Error(`auto-file read failed: ${error.message}`);
  const rows = (data ?? []) as Waiting[];
  const out: AutoFileResult = { filed: 0, ideas: 0, tagged: 0 };

  for (const row of rows) {
    const c = row.classification ?? {};
    const held = c.held === true;
    const next: Record<string, unknown> = { ...c, unreviewed: true };
    if (held) {
      // What the guess was is kept for anyone who looks later; the item itself is an idea.
      next.suggested_kind = c.kind;
      next.kind = "idea";
      next.held = false;
    }
    const { error: upErr } = await db
      .from("raw_captures")
      .update({ auto_filed_at: now.toISOString(), reviewed_at: now.toISOString(), classification: next })
      .eq("id", row.id)
      .is("reviewed_at", null);
    if (upErr) {
      console.error(`[capture/autofile] ${row.id}:`, upErr.message);
      continue;
    }
    out.filed += 1;
    if (held) out.ideas += 1;

    // Tag the ticket it made, so "what did I never look at?" has an answer.
    // Only captures the pipeline handled (processed_at set): rows from
    // before it carry no promise of a card, and tagging years of old
    // tickets at once would be noise.
    if (row.routed_to === "tickets" && row.routed_id && row.processed_at) {
      const { data: t } = await db.from("tickets").select("id, tags").eq("id", row.routed_id).maybeSingle();
      const tags = ((t as { tags: string[] | null } | null)?.tags ?? []) as string[];
      if (t && !tags.includes(UNREVIEWED_TAG)) {
        const { error: tagErr } = await db.from("tickets").update({ tags: [...tags, UNREVIEWED_TAG] }).eq("id", row.routed_id);
        if (!tagErr) out.tagged += 1;
      }
    }
  }
  return out;
}
