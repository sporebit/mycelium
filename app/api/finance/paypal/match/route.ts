import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { runPayPalMatcher, getMatchCounts } from "@/lib/finance/paypal-match";

export const runtime = "nodejs";
export const maxDuration = 30;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function POST() {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  try {
    const supabase = createServerClient();
    const ran = await runPayPalMatcher(supabase, uid);
    const counts = await getMatchCounts(supabase, uid);
    return NextResponse.json({ ran, counts });
  } catch (err) {
    console.error("[/api/finance/paypal/match POST]", err);
    return NextResponse.json({ error: "match failed" }, { status: 500 });
  }
}
