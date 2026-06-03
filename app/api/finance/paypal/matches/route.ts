import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getMatchCounts, getAmbiguousPayments } from "@/lib/finance/paypal-match";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET() {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  try {
    const supabase = createServerClient();
    const [counts, ambiguous] = await Promise.all([
      getMatchCounts(supabase, uid),
      getAmbiguousPayments(supabase, uid),
    ]);
    return NextResponse.json({ counts, ambiguous });
  } catch (err) {
    console.error("[/api/finance/paypal/matches GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
