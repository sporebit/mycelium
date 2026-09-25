import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/** GET /api/people/import/batches — recent import batches with their counts and how many rows still wait for a decision. */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("people_import_batches")
      .select("id, filename, card_count, imported, review, skipped, failed, status, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const batches = (data ?? []) as Array<{ id: string }>;
    const pending = new Map<string, number>();
    if (batches.length) {
      const { data: rows } = await supabase
        .from("people_import_candidates")
        .select("batch_id")
        .eq("decision", "pending")
        .in("batch_id", batches.map((b) => b.id));
      for (const r of (rows ?? []) as Array<{ batch_id: string }>) pending.set(r.batch_id, (pending.get(r.batch_id) ?? 0) + 1);
    }
    return NextResponse.json({ batches: batches.map((b) => ({ ...b, pending: pending.get(b.id) ?? 0 })) });
  } catch (err) {
    console.error("[/api/people/import/batches GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
