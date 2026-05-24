import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { computeStreak } from "@/lib/streak/compute";

export const runtime = "nodejs";

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const supabase = createServerClient();
    const days = await computeStreak(supabase, uid);
    return NextResponse.json({ days });
  } catch (err) {
    console.error("[streak GET]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
