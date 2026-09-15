import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { disabled: boolean } disables or re-enables a user (audited). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { disabled?: unknown };
  if (typeof body.disabled !== "boolean") return NextResponse.json({ error: "disabled must be boolean" }, { status: 400 });
  const db = await createUserClient();
  const { error } = await db.rpc("admin_set_user_disabled", { p_user: id, p_disabled: body.disabled });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}

/** DELETE removes a user entirely (audited). Their team rows stay. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await createUserClient();
  const { error } = await db.rpc("admin_delete_user", { p_user: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
