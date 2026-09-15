import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/**
 * "Who has seen my data": cross-user read events where the caller is the
 * subject, newest first, with the actor's display name. Under /api/account
 * this needs aal2 and a fresh re-auth (middleware).
 */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await createUserClient();
  const { data, error } = await db
    .from("audit_events")
    .select("id, at, actor_id, action, section, entity_group, space_id, team_id, meta")
    .eq("subject_user_id", me.id)
    .in("action", ["cross_user_read", "break_glass_request", "grant_created", "grant_revoked", "member_added", "role_changed", "sections_changed"])
    .order("at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const actors = [...new Set((data ?? []).map((e) => e.actor_id as string).filter(Boolean))];
  const { data: profiles } = actors.length
    ? await db.from("profiles").select("id, display_name").in("id", actors)
    : { data: [] as { id: string; display_name: string | null }[] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]));
  return NextResponse.json({
    events: (data ?? []).map((e) => ({ ...e, actor_name: names.get(e.actor_id as string) ?? null })),
  });
}
