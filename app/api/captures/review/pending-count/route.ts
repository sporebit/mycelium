import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchPendingReviewCount } from "@/lib/captures/reviewCount";

export const runtime = "nodejs";

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const supabase = createServerClient();
  const count = await fetchPendingReviewCount(supabase, uid);
  return NextResponse.json({ count });
}
