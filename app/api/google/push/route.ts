import { NextRequest, NextResponse } from "next/server";
import { pullFamilyCalendar } from "@/lib/family/calendar/sync";
import { syncRowForChannel } from "@/lib/system/familyCalendarChannel";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/google/push — Google's push channel for the Family calendar
 * (family calendar spec §4.2). Google posts an empty body with headers
 * naming the channel and its token; the headers are checked against the
 * stored channel and the only thing that happens is a pull, as the
 * connection's owner. Nothing is read from the request body and nothing
 * personal is returned. Public (lib/auth/gate.ts) because Google carries no
 * session; a wrong channel or token is answered 200 and ignored, so probing
 * learns nothing.
 */
export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id");
  const token = req.headers.get("x-goog-channel-token");
  const state = req.headers.get("x-goog-resource-state");
  if (!channelId || !token) return new NextResponse(null, { status: 200 });
  // "sync" is Google saying the channel is up; nothing changed yet.
  if (state === "sync") return new NextResponse(null, { status: 200 });
  try {
    const row = await syncRowForChannel(channelId, token);
    if (!row) return new NextResponse(null, { status: 200 });
    await withUser(row.owner_user_id!, (db) => pullFamilyCalendar(db, row));
  } catch (err) {
    console.error("[google/push]", err);
  }
  return new NextResponse(null, { status: 200 });
}
