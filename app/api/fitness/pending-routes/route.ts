import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import type { PendingWorkoutRoute } from "@/lib/fitness/types";

export const runtime = "nodejs";

/** List unexpired pending workout routes for the current user. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("pending_workout_routes")
      .select("id, raw_text, parsed_payload, expires_at, created_at, space_id")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[/api/fitness/pending-routes GET]", error);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    auditListRead(req, data, "fitness", "sessions");
    return NextResponse.json({ pending: (data ?? []) as unknown as PendingWorkoutRoute[] });
  } catch (err) {
    console.error("[/api/fitness/pending-routes GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
