import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { getOwnProfile } from "@/lib/auth/session";
import { runRundowns } from "@/lib/system/rundowns";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Weekly rundowns (P12 Part 6). Hourly cron with CRON_SECRET: sends every
 * team whose slot is this hour. The instance owner may also call it from a
 * session with ?force=1 (and optionally ?team=<id>) to send now.
 */
export async function GET(req: NextRequest) {
  const isCron = matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (!isCron) {
    const profile = await getOwnProfile();
    if (!profile?.is_instance_owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  const teamId = req.nextUrl.searchParams.get("team") ?? undefined;
  const origin = process.env.NODE_ENV === "production" && process.env.PUBLIC_BASE_URL ? process.env.PUBLIC_BASE_URL : req.nextUrl.origin;
  try {
    const report = await runRundowns({ force, teamId, origin });
    return NextResponse.json(report);
  } catch (err) {
    console.error("[cron/rundowns]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
