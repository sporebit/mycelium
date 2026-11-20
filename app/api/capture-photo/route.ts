import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { processCapture, receiveCapture } from "@/lib/capture/pipeline";
import { CAPTURES_BUCKET } from "@/lib/storage/captures";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";
export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, status: "error", error }, { status });

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heic", "image/gif": "gif" };

/**
 * POST /api/capture-photo — a photo or a screenshot, as a multipart form
 * (the iPhone share sheet, or the camera).
 *
 * Fields:
 *   image        the file (jpeg, png, webp, heic)
 *   client_uuid  the sender's id for this capture
 *   text         optional words to go with it (a caption, the page it came from)
 *
 * The capture is stored and the answer goes back at once, 202
 * `{ ok, status: "saved", capture_id }`. The picture is kept in the
 * capture's own folder and shown on its review card. No model looks at the
 * picture: reading images costs money, so what the photo is stays the
 * person's call at review. With words, the words are filed like any other
 * capture and the photo rides along.
 */
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return fail("Unauthorized", 401);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("expected multipart form", 400);
  }
  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) return fail("image file required", 400);
  const ext = IMAGE_EXT[image.type.toLowerCase()] ?? (image.name.includes(".") ? image.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "");
  if (!ext || !Object.values(IMAGE_EXT).includes(ext === "jpeg" ? "jpg" : ext)) return fail("that file is not a picture this can keep (jpeg, png, webp, heic, gif)", 400);
  const words = ((form.get("text") as string | null) ?? "").trim();
  const clientUuid = ((form.get("client_uuid") as string | null) ?? "").trim() || null;

  try {
    const supabase = await createUserClient();
    // A photo with no words is still a capture: it is held for review as itself.
    const received = await receiveCapture(supabase, { text: words || "Photo", clientUuid, source: "api", textSource: "typed", forcedKind: words ? null : "capture" });
    const path = `${received.id}/photo.${ext === "jpeg" ? "jpg" : ext}`;
    const { error } = await supabase.storage.from(CAPTURES_BUCKET).upload(path, await image.arrayBuffer(), { contentType: image.type || `image/${ext}`, upsert: false });
    if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`photo not stored: ${error.message}`);

    const { data: row } = await supabase.from("raw_captures").select("classification").eq("id", received.id).single();
    await supabase
      .from("raw_captures")
      .update({ classification: { ...((row?.classification as Record<string, unknown> | null) ?? {}), photo_path: path } })
      .eq("id", received.id);

    after(async () => {
      try {
        if (!received.duplicate) {
          await processCapture(supabase, uid, received.id, { reply: true });
          // Processing writes a fresh classification; the photo stays attached to it.
          const { data: done } = await supabase.from("raw_captures").select("classification").eq("id", received.id).single();
          const cls = (done?.classification as Record<string, unknown> | null) ?? {};
          if (cls.photo_path !== path) await supabase.from("raw_captures").update({ classification: { ...cls, photo_path: path } }).eq("id", received.id);
        }
      } catch (err) {
        console.error("[capture-photo] processing soft-fail:", err);
      }
    });

    return NextResponse.json({ ok: true, status: "saved", capture_id: received.id, photo: "stored", ...(received.duplicate ? { deduplicated: true } : {}), summary: "Saved" }, { status: 202 });
  } catch (err) {
    console.error("[capture-photo] failed:", err);
    return fail("capture_failed", 500);
  }
}
