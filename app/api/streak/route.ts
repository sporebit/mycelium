import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { computeStreak } from "@/lib/streak/compute";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createUserClient();
    const days = await computeStreak(supabase);
    return NextResponse.json({ days });
  } catch (err) {
    console.error("[streak GET]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
