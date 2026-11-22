import { NextRequest, NextResponse } from "next/server";
import { PM_BUCKET } from "@/lib/phirstmaxx/files";
import { UUID_RE, pmRequest } from "@/lib/phirstmaxx/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const gone = () => NextResponse.json({ error: "not found" }, { status: 404 });

/**
 * GET /api/phirstmaxx/things/<id>/image — the thing's picture as a
 * short-lived signed link (a redirect). The row is read as the caller and
 * the bucket's rule ties the file to the space, so the path never leaves
 * the server.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return gone();
  const r = await pmRequest(req);
  if (!r.ok) return r.res;
  try {
    const { data } = await r.supabase.from("pm_things").select("image_path").eq("id", id).eq("space_id", r.ctx.spaceId).maybeSingle();
    const path = (data as { image_path: string | null } | null)?.image_path;
    if (!path) return gone();
    const { data: signed, error } = await r.supabase.storage.from(PM_BUCKET).createSignedUrl(path, 300);
    if (error || !signed?.signedUrl) return gone();
    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  } catch (err) {
    console.error("[/api/phirstmaxx/things/:id/image]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
