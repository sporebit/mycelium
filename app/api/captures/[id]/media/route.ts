import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { CAPTURES_BUCKET } from "@/lib/storage/captures";

export const runtime = "nodejs";

/**
 * GET /api/captures/[id]/media?kind=audio|photo — the capture's own
 * recording or picture, as a short-lived signed link (a redirect). The
 * capture's row decides who may fetch it: RLS on the row, and the bucket's
 * policy ties the file to the row (0159).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const kind = req.nextUrl.searchParams.get("kind") === "photo" ? "photo" : "audio";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const supabase = await createUserClient();
    const { data } = await supabase.from("raw_captures").select("id, audio_path, classification, parent_capture_id").eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    let path = kind === "audio" ? (data.audio_path as string | null) : (((data.classification as Record<string, unknown> | null)?.photo_path as string | undefined) ?? null);
    // An item split out of a longer recording plays the original's recording.
    if (!path && kind === "audio" && data.parent_capture_id) {
      const { data: parent } = await supabase.from("raw_captures").select("audio_path").eq("id", data.parent_capture_id).maybeSingle();
      path = (parent?.audio_path as string | null) ?? null;
    }
    if (!path) return NextResponse.json({ error: `this capture has no ${kind}` }, { status: 404 });
    const { data: signed, error } = await supabase.storage.from(CAPTURES_BUCKET).createSignedUrl(path, 300);
    if (error || !signed?.signedUrl) return NextResponse.json({ error: "not available" }, { status: 404 });
    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  } catch (err) {
    console.error("[/api/captures/:id/media]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
