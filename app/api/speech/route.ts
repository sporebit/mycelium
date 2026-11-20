import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { MAX_LINE_CHARS, VOICES } from "@/lib/speech/clips";
import { requestSpeech } from "@/lib/speech/server";

export const runtime = "nodejs";

/**
 * POST /api/speech `{ text, voice? }` — a spoken line from the PC's voice
 * (master run §9, §11). Answers one of:
 *   { status: "ready", url, seconds }  play the file (a signed link, an hour)
 *   { status: "queued" }               the PC is rendering it; say it yourself this time
 *   { status: "off" }                  the PC is off; say it yourself
 *   { status: "empty" }                nothing to say
 * Free: the PC renders with Kokoro; no paid service is called. The caller
 * never waits on the PC.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { text?: unknown; voice?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ error: "text is the line to say" }, { status: 400 });
  if (text.length > MAX_LINE_CHARS * 4) return NextResponse.json({ error: `text is at most ${MAX_LINE_CHARS} characters` }, { status: 400 });
  const voice = typeof body?.voice === "string" ? body.voice : undefined;
  const db = await createUserClient();
  const answer = await requestSpeech(db, text, { voice });
  return NextResponse.json(answer);
}

/** GET /api/speech — the voices on offer. */
export async function GET() {
  return NextResponse.json({ voices: VOICES });
}
