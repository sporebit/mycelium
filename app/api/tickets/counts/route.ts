import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { ticketCounts } from "@/lib/tickets/query";
import { parseSurface } from "@/lib/tickets/surface";

export const runtime = "nodejs";

/** GET /api/tickets/counts?surface=tickets|tasks — tab badges for the GTD home, per surface. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const counts = await ticketCounts(supabase, parseSurface(req.nextUrl.searchParams.get("surface")));
    return NextResponse.json({ counts });
  } catch (err) {
    console.error("[/api/tickets/counts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
