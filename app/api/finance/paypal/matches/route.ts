import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { getMatchCounts, getAmbiguousPayments } from "@/lib/finance/paypal-match";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createUserClient();
    const [counts, ambiguous] = await Promise.all([
      getMatchCounts(supabase),
      getAmbiguousPayments(supabase),
    ]);
    return NextResponse.json({ counts, ambiguous });
  } catch (err) {
    console.error("[/api/finance/paypal/matches GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
