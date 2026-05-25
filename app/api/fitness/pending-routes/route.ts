import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { PendingWorkoutRoute } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/** List unexpired pending workout routes for the current user. */
export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  try {
    const supabase = createServerClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("pending_workout_routes")
      .select("id, user_id, raw_text, parsed_payload, expires_at, created_at")
      .eq("user_id", uid)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[/api/fitness/pending-routes GET]", error);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    return NextResponse.json({ pending: (data ?? []) as PendingWorkoutRoute[] });
  } catch (err) {
    console.error("[/api/fitness/pending-routes GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
