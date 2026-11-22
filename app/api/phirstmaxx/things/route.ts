import { NextRequest, NextResponse } from "next/server";
import { bad, pmRequest } from "@/lib/phirstmaxx/http";
import { listThings, parseThingFilters } from "@/lib/phirstmaxx/things";

export const runtime = "nodejs";

/**
 * GET /api/phirstmaxx/things — the researched cards (spec §8). Filters:
 * fits=week (fits a together-window in the next seven days), indoor=1|0,
 * dog=yes (dogs allowed, at least outside), max_km (drive from the
 * caller's home), max_cost (pounds per adult), q (words in the name,
 * summary or address), archived=1.
 */
export async function GET(req: NextRequest) {
  const r = await pmRequest(req);
  if (!r.ok) return r.res;
  try {
    const things = await listThings(r.supabase, r.ctx, parseThingFilters(req.nextUrl.searchParams));
    return NextResponse.json({ things, people: r.ctx.people.map((p) => ({ id: p.id, name: p.name, colour: p.colour })), me: r.ctx.uid });
  } catch (err) {
    console.error("[/api/phirstmaxx/things GET]", err);
    return bad("fetch failed", 500);
  }
}
