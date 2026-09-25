import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { mergePeople, resolvePersonId } from "@/lib/people/contacts";

export const runtime = "nodejs";

/**
 * POST /api/people/merge { survivor_id, loser_id, fields? } — people-contacts
 * C3. The database function walks every FK to people.id, de-duplicates
 * unique-key collisions, soft-deletes the loser with merged_into_id and
 * writes the audit row, in one transaction.
 */
export async function POST(req: NextRequest) {
  let body: { survivor_id?: string; loser_id?: string; fields?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.survivor_id || !body.loser_id) return NextResponse.json({ error: "survivor_id and loser_id required" }, { status: 400 });
  if (body.survivor_id === body.loser_id) return NextResponse.json({ error: "pick two different people" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const [s, l] = await Promise.all([resolvePersonId(supabase, body.survivor_id), resolvePersonId(supabase, body.loser_id)]);
    if (!s || !l) return NextResponse.json({ error: "person not found" }, { status: 404 });
    if (s.id === l.id) return NextResponse.json({ error: "already the same person" }, { status: 409 });
    const result = await mergePeople(supabase, s.id, l.id, body.fields && typeof body.fields === "object" ? body.fields : {});
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/api/people/merge POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "merge failed" }, { status: 400 });
  }
}
