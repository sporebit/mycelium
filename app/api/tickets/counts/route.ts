import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { ticketCounts } from "@/lib/tickets/query";
import { parseArea } from "@/lib/tickets/area";

export const runtime = "nodejs";

/** GET /api/tickets/counts?area=technical|life|<area id>&project=<id> — tab badges for the Tasks home under the Area chip (tasks-merge M2). */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const sp = req.nextUrl.searchParams;
    const area = parseArea(sp.get("area"));
    const counts = await ticketCounts(supabase, { areaKind: area.kind, areaId: area.areaId, projectId: sp.get("project") });
    return NextResponse.json({ counts });
  } catch (err) {
    console.error("[/api/tickets/counts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
