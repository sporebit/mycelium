import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { fetchPendingReviewCount } from "@/lib/captures/reviewCount";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createUserClient();
  const count = await fetchPendingReviewCount(supabase);
  return NextResponse.json({ count });
}
