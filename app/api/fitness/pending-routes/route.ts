import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import type { PendingWorkoutRoute } from "@/lib/fitness/types";

export const runtime = "nodejs";

/** List unexpired pending workout routes for the current user. */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("pending_workout_routes")
      .select("id, raw_text, parsed_payload, expires_at, created_at")
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
