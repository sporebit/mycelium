import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid } from "@/lib/tickets/server";
import { netWorthView } from "@/lib/finance/holdingsServer";

export const runtime = "nodejs";

/**
 * GET /api/finance/networth?months=36 — the net-worth line over time: the
 * sheet's daily snapshot plus the by-hand holdings as they stood on each
 * day, with the holdings and how old each figure is. Needs no sheet: with
 * holdings alone the line is the holdings.
 */
export async function GET(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const months = Math.min(120, Math.max(1, parseInt(req.nextUrl.searchParams.get("months") ?? "36", 10) || 36));
  try {
    return NextResponse.json(await netWorthView(await createUserClient(), months));
  } catch (err) {
    console.error("[/api/finance/networth GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
