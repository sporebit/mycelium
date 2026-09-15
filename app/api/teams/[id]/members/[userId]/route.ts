import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { SHAREABLE_SECTIONS, rpcMessage } from "@/lib/access/teams";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/**
 * PATCH { role } changes a member's role; { sections: [{ section, can_view,
 * can_edit, can_create_delete, can_share }] } sets toggles (narrow only —
 * the role decides the ceiling). Rules live in the SQL functions.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, userId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = await createUserClient();

  if (typeof body.role === "string") {
    const { error } = await db.rpc("set_team_member_role", { p_team: id, p_user: userId, p_role: body.role });
    if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 403 });
  }

  if (Array.isArray(body.sections)) {
    for (const s of body.sections as Record<string, unknown>[]) {
      if (typeof s.section !== "string" || !SHAREABLE_SECTIONS.includes(s.section as never)) {
        return NextResponse.json({ error: `unknown section ${String(s.section)}` }, { status: 400 });
      }
      const { error } = await db.rpc("set_team_member_sections", {
        p_team: id,
        p_user: userId,
        p_section: s.section,
        p_can_view: s.can_view !== false,
        p_can_edit: s.can_edit !== false,
        p_can_create_delete: s.can_create_delete !== false,
        p_can_share: s.can_share !== false,
      });
      if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 403 });
    }
  }
  return NextResponse.json({ ok: true });
}

/** Remove a member. Their contributions stay with the team. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, userId } = await ctx.params;
  const db = await createUserClient();
  const { error } = await db.rpc("remove_team_member", { p_team: id, p_user: userId });
  if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 403 });
  return NextResponse.json({ ok: true });
}
