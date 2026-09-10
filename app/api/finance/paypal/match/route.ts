import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { runPayPalMatcher, getMatchCounts } from "@/lib/finance/paypal-match";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  try {
    const supabase = await createUserClient();
    const ran = await runPayPalMatcher(supabase);
    const counts = await getMatchCounts(supabase);
    return NextResponse.json({ ran, counts });
  } catch (err) {
    console.error("[/api/finance/paypal/match POST]", err);
    return NextResponse.json({ error: "match failed" }, { status: 500 });
  }
}
