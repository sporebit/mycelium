import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid } from "@/lib/tickets/server";
import { FAMILY_BUCKET, UUID_RE } from "@/lib/family/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ resource: string; id: string }> };
const gone = () => NextResponse.json({ error: "not found" }, { status: 404 });

/**
 * GET /api/family/entries/<id>/media, /api/family/household/<id>/media —
 * the row's file, as a short-lived signed link (a redirect). The row
 * decides who may fetch it: it is read as the caller, and the bucket's
 * rule ties the file to the space (0171).
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { resource, id } = await ctx.params;
  if ((resource !== "entries" && resource !== "household") || !UUID_RE.test(id)) return gone();
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createUserClient();
    const [table, col] = resource === "entries" ? ["family_entries", "media_path"] : ["household_items", "file_path"];
    const { data } = await supabase.from(table).select(col).eq("id", id).maybeSingle();
    const path = (data as Record<string, string | null> | null)?.[col];
    if (!path) return gone();
    const { data: signed, error } = await supabase.storage.from(FAMILY_BUCKET).createSignedUrl(path, 300);
    if (error || !signed?.signedUrl) return gone();
    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  } catch (err) {
    console.error(`[/api/family/${resource}/:id/media]`, err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
