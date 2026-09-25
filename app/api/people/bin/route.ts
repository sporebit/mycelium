import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { PERSON_SELECT } from "@/lib/people/contacts";

export const runtime = "nodejs";

/** GET /api/people/bin — soft-deleted people, newest first; a merged loser says who it went into (people-contacts C4). */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("people")
      .select(PERSON_SELECT)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const purgeAfterDays = 30;
    return NextResponse.json({ people: data ?? [], purge_after_days: purgeAfterDays });
  } catch (err) {
    console.error("[/api/people/bin GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
