import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/openai/whisper";

export const runtime = "nodejs";
export const maxDuration = 30;

const CHAT_PROMPT =
  "One spoken turn in a conversation with a personal assistant — tasks, training, food, money, ideas, day-to-day life. Names may include: Phil, Sporebit, Myphelium2, Armthorpe, Doncaster.";

/**
 * Transcription only, for a voice-chat turn (MYC-148). The voice loop used to
 * post each turn to /api/capture-audio, which also classified it with Haiku
 * and wrote a capture into the review queue — a model call and a row per
 * sentence spoken to an agent. This route is Whisper and nothing else.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "audio file required" }, { status: 400 });

  const buffer = await audio.arrayBuffer();
  if (buffer.byteLength < 500) return NextResponse.json({ text: "" });

  try {
    const ext = audio.type.includes("mp4") ? "mp4" : "webm";
    const text = await transcribeAudio(buffer, audio.name || `turn.${ext}`, audio.type || `audio/${ext}`, { prompt: CHAT_PROMPT });
    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    console.error("[agents/transcribe]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "transcription failed" }, { status: 502 });
  }
}
