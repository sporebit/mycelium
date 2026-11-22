import { NextRequest, NextResponse } from "next/server";
import { UUID_RE, bad, pmRequest } from "@/lib/phirstmaxx/http";
import { listNotifications, markRead } from "@/lib/phirstmaxx/notify";
import { readJson } from "@/lib/tickets/server";

export const runtime = "nodejs";

/** GET /api/phirstmaxx/notifications?unread=1&limit= — the caller's in-app list (spec §7: a missed push loses nothing). */
export async function GET(req: NextRequest) {
  const r = await pmRequest(req);
  if (!r.ok) return r.res;
  try {
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 50) || 50));
    const notifications = await listNotifications(r.supabase, r.ctx.spaceId, r.ctx.uid, { unreadOnly: sp.get("unread") === "1", limit });
    return NextResponse.json({ notifications });
  } catch (err) {
    console.error("[/api/phirstmaxx/notifications GET]", err);
    return bad("fetch failed", 500);
  }
}

/** POST { action: "read", ids: [...] } — mark the caller's notifications read. */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const r = await pmRequest(req, body);
  if (!r.ok) return r.res;
  try {
    if (body.action !== "read") return bad("action is read.");
    const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)).slice(0, 200) : [];
    if (ids.length === 0) return bad("ids is a list of notification ids.");
    await markRead(r.supabase, r.ctx.spaceId, r.ctx.uid, ids);
    return NextResponse.json({ ok: true, read: ids.length });
  } catch (err) {
    console.error("[/api/phirstmaxx/notifications POST]", err);
    return bad("failed", 500);
  }
}
