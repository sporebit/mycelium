import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, ticketWriteGate } from "@/lib/tickets/server";
import { ensureDay } from "@/lib/daylog/engine";
import { DATE_RE } from "@/lib/daylog/day";
import { signDaylogMedia, uploadDaylogPhoto } from "@/lib/daylog/media";

export const runtime = "nodejs";

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST multipart {file, caption?, taken_at?, scene_id?} — a photo added from
 * the day page (decision 28). Telegram photos arrive through the webhook.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ date: string }> }) {
  const { date } = await ctx.params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const uid = await principalUid();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart form expected" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (!IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: "images only" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "10 MB limit" }, { status: 413 });
  const caption = typeof form.get("caption") === "string" ? String(form.get("caption")) : null;
  const takenRaw = form.get("taken_at");
  const takenAt = typeof takenRaw === "string" && !Number.isNaN(Date.parse(takenRaw)) ? new Date(takenRaw).toISOString() : null;
  const sceneRaw = form.get("scene_id");
  const sceneId = typeof sceneRaw === "string" && /^[0-9a-f-]{36}$/i.test(sceneRaw) ? sceneRaw : null;
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const day = await ensureDay(supabase, date);
    const row = await uploadDaylogPhoto(supabase, day.id, await file.arrayBuffer(), file.type, { takenAt, caption });
    if (sceneId) await supabase.from("daylog_media").update({ scene_id: sceneId }).eq("id", row.id);
    const [signed] = await signDaylogMedia(supabase, [{ ...row, scene_id: sceneId ?? row.scene_id }]);
    return NextResponse.json({ media: signed }, { status: 201 });
  } catch (err) {
    console.error("[/api/journal/days/:date/media POST]", err);
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
}
