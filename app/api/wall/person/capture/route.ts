import { NextRequest, NextResponse } from "next/server";
import { captureRecording } from "@/lib/capture/receiveAudio";
import { receiveCapture } from "@/lib/capture/pipeline";
import { unauthorised, wallDevice, wallPerson } from "@/lib/system/wallRequest";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/wall/person/capture — tap-to-talk (master run §11): a multipart
 * form with `audio` (and `client_uuid`), or `text` typed on the keypad.
 * Stored as the unlocked person's capture through the same path as the
 * phone (lib/capture/receiveAudio.ts). Tap to start, tap to stop; the wall
 * never listens on its own.
 */
export async function POST(req: NextRequest) {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  const person = await wallPerson(device);
  if (!person) return unauthorised("locked");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "expected multipart form" }, { status: 400 });
  }
  const audio = form.get("audio");
  const text = ((form.get("text") as string | null) ?? "").trim();
  const clientUuid = ((form.get("client_uuid") as string | null) ?? "").trim() || null;
  if (!(audio instanceof File && audio.size > 0) && !text) return NextResponse.json({ ok: false, error: "audio or text required" }, { status: 400 });
  try {
    const result = await withUser(person.uid, async (db) => {
      if (audio instanceof File && audio.size > 0) return captureRecording(db, person.uid, { audio, text, clientUuid, source: "api" });
      const r = await receiveCapture(db, { text, clientUuid, source: "api", textSource: "typed", forcedKind: null });
      return { id: r.id, duplicate: !!r.duplicate, hasText: true };
    });
    return NextResponse.json({ ok: true, capture_id: result.id, summary: result.hasText ? "Saved" : "Saved. The words will follow once it is transcribed." }, { status: 202 });
  } catch (err) {
    console.error("[wall/person/capture]", err);
    return NextResponse.json({ ok: false, error: "Not saved. Try again." }, { status: 500 });
  }
}
