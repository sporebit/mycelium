import { NextRequest, NextResponse } from "next/server";
import { MAX_LINE_CHARS } from "@/lib/speech/clips";
import { requestSpeech } from "@/lib/speech/server";
import { createUserClient } from "@/lib/supabase/user";
import { unauthorised, wallDevice } from "@/lib/system/wallRequest";

export const runtime = "nodejs";

/**
 * POST /api/wall/speech { text, voice? } — the PC's voice for the wall
 * (master run §9, §11). The wall is not a signed-in person: it holds the
 * device cookie the middleware honours on /api/wall/* alone, so it cannot
 * reach /api/speech and asks here instead. Same answer shape as /api/speech;
 * the clip is kept under the device's own space. Nothing paid is called.
 */
export async function POST(req: NextRequest) {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  const body = (await req.json().catch(() => null)) as { text?: unknown; voice?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ error: "text is the line to say" }, { status: 400 });
  if (text.length > MAX_LINE_CHARS * 4) return NextResponse.json({ error: `text is at most ${MAX_LINE_CHARS} characters` }, { status: 400 });
  const voice = typeof body?.voice === "string" ? body.voice : undefined;
  try {
    const db = await createUserClient();
    return NextResponse.json(await requestSpeech(db, text, { voice }));
  } catch (err) {
    console.error("[wall/speech]", err);
    return NextResponse.json({ status: "off" });
  }
}
