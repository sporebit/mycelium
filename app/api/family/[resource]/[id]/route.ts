import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { deleteRow, isResource, updateRow } from "@/lib/family/resources";
import { familyCtx } from "@/lib/family/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ resource: string; id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** PATCH /api/family/<list>/<id> — change one row: only the fields sent. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { resource, id } = await ctx.params;
  if (!isResource(resource)) return bad("not found", 404);
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body) return bad("bad json");
  try {
    const supabase = await createUserClient();
    const family = await familyCtx(supabase, uid, typeof body.space === "string" ? body.space : null);
    if (!family) return bad("No family space.", 404);
    const out = await updateRow(resource, id, body, family);
    if (!out.ok) return bad(out.error, out.status);
    const { media_path, file_path, ...rest } = out.value as Record<string, unknown>;
    return NextResponse.json({ row: { ...rest, has_media: !!media_path, has_file: !!file_path } });
  } catch (err) {
    console.error(`[/api/family/${resource}/:id PATCH]`, err);
    return bad("failed", 500);
  }
}

/** DELETE — remove one row, and its file with it. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { resource, id } = await ctx.params;
  if (!isResource(resource)) return bad("not found", 404);
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  try {
    const supabase = await createUserClient();
    const family = await familyCtx(supabase, uid, req.nextUrl.searchParams.get("space"));
    if (!family) return bad("No family space.", 404);
    const out = await deleteRow(resource, id, family);
    return out.ok ? NextResponse.json(out.value) : bad(out.error, out.status);
  } catch (err) {
    console.error(`[/api/family/${resource}/:id DELETE]`, err);
    return bad("failed", 500);
  }
}
