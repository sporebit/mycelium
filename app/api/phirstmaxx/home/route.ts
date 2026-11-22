import { NextRequest, NextResponse } from "next/server";
import { homeData } from "@/lib/phirstmaxx/home";
import { bad, pmRequest } from "@/lib/phirstmaxx/http";

export const runtime = "nodejs";

/** GET /api/phirstmaxx/home — what the Home screen shows (spec §8), in one read. */
export async function GET(req: NextRequest) {
  const r = await pmRequest(req);
  if (!r.ok) return r.res;
  try {
    return NextResponse.json(await homeData(r.supabase, r.ctx));
  } catch (err) {
    console.error("[/api/phirstmaxx/home GET]", err);
    return bad("fetch failed", 500);
  }
}
