import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { attachContactPoints, PERSON_SELECT } from "@/lib/people/contacts";
import type { Person } from "@/lib/people/types";

export const runtime = "nodejs";

/**
 * GET /api/people/import/batches/[batchId] — the batch and its review list:
 * each candidate with the parsed card and the person it matched (with that
 * person's numbers and emails), pending first.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { data: batch } = await supabase
      .from("people_import_batches")
      .select("id, filename, card_count, imported, review, skipped, failed, status, created_at, finished_at")
      .eq("id", batchId)
      .maybeSingle();
    if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data: rows, error } = await supabase
      .from("people_import_candidates")
      .select("id, card_index, uid, parsed, match_person_id, match_reason, match_score, decision, decided_at, created_person_id, created_at")
      .eq("batch_id", batchId)
      .order("decision", { ascending: false }) // pending sorts after merged/separate/skipped alphabetically — flip below
      .order("card_index");
    if (error) throw error;
    const candidates = ((rows ?? []) as Array<{ decision: string; card_index: number; match_person_id: string | null }>).sort((a, b) => {
      if ((a.decision === "pending") !== (b.decision === "pending")) return a.decision === "pending" ? -1 : 1;
      return a.card_index - b.card_index;
    });
    const ids = Array.from(new Set(candidates.map((c) => c.match_person_id).filter((x): x is string => !!x)));
    const people = new Map<string, unknown>();
    if (ids.length) {
      const { data: prows } = await supabase.from("people").select(PERSON_SELECT).in("id", ids);
      const withPoints = await attachContactPoints(supabase, (prows ?? []) as Person[]);
      for (const p of withPoints) people.set(p.id, p);
    }
    return NextResponse.json({
      batch,
      candidates: candidates.map((c) => ({ ...c, match_person: c.match_person_id ? (people.get(c.match_person_id) ?? null) : null })),
    });
  } catch (err) {
    console.error("[/api/people/import/batches/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
