import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid } from "@/lib/tickets/server";

export const runtime = "nodejs";

/**
 * GET /api/tickets/assignees — who a ticket can be assigned to (spec §10,
 * Part H): the caller plus every member of the teams the caller belongs to.
 * RLS on team_members already limits the rows to the caller's teams.
 */
export async function GET() {
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const ids = new Set<string>();
    if (uid) ids.add(uid);
    const { data: members } = await supabase.from("team_members").select("user_id").limit(500);
    for (const m of (members ?? []) as Array<{ user_id: string | null }>) if (m.user_id) ids.add(m.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", [...ids]);
    const byId = new Map((profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? null]));
    const assignees = [...ids].map((id) => ({ id, display_name: byId.get(id) ?? (id === uid ? "Me" : id.slice(0, 8)), me: id === uid }));
    assignees.sort((a, b) => Number(b.me) - Number(a.me) || (a.display_name ?? "").localeCompare(b.display_name ?? ""));
    return NextResponse.json({ assignees });
  } catch (err) {
    console.error("[/api/tickets/assignees GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
