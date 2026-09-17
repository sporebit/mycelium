import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { ticketCounts } from "@/lib/tickets/query";

export const runtime = "nodejs";

/** GET /api/tickets/counts — tab badges for the GTD home. */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const counts = await ticketCounts(supabase);
    return NextResponse.json({ counts });
  } catch (err) {
    console.error("[/api/tickets/counts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
