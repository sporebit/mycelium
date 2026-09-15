import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/** My teams' rundown settings (visible to members) and my subscriptions. */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await createUserClient();
  const [{ data: settings }, { data: subscriptions }, { data: issues }] = await Promise.all([
    db.from("rundown_settings").select("team_id, enabled, content, sections, day, hour"),
    db.from("rundown_subscriptions").select("team_id, channels, opted_out, day, hour"),
    db.from("rundown_issues").select("team_id, week, channel, sent_at, error, created_at").eq("channel", "in_app").order("created_at", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({ settings: settings ?? [], subscriptions: subscriptions ?? [], issues: issues ?? [] });
}

/**
 * PATCH { team_id, settings: {…} } (owner) or { team_id, subscription: {…} }
 * (member). Rules live in the SQL functions of migration 0115.
 */
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { team_id?: unknown; settings?: Record<string, unknown>; subscription?: Record<string, unknown> };
  if (typeof body.team_id !== "string") return NextResponse.json({ error: "team_id is required" }, { status: 400 });
  const db = await createUserClient();

  if (body.settings) {
    const s = body.settings;
    const { error } = await db.rpc("set_rundown_settings", {
      p_team: body.team_id,
      p_enabled: s.enabled === true,
      p_content: s.content ?? null,
      p_sections: Array.isArray(s.sections) ? s.sections : null,
      p_day: typeof s.day === "number" ? s.day : null,
      p_hour: typeof s.hour === "number" ? s.hour : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (body.subscription) {
    const s = body.subscription;
    const { error } = await db.rpc("set_rundown_subscription", {
      p_team: body.team_id,
      p_channels: Array.isArray(s.channels) ? s.channels : null,
      p_opted_out: s.opted_out === true,
      p_day: typeof s.day === "number" ? s.day : null,
      p_hour: typeof s.hour === "number" ? s.hour : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
