import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { agentVoice, speakable, synthesize, type AgentVoice } from "@/lib/agents/voice";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Speak one sentence in an agent's voice (MYC-148/149). The provider's audio
 * stream is passed straight through, so the first bytes reach the client as
 * soon as the provider has them rather than after the whole clip.
 *
 * Body: `{ text, agentId }` speaks with the agent's stored voice; `{ text,
 * voice: { provider, voice_id } }` previews a voice from the picker.
 */
export async function POST(req: NextRequest) {
  let body: { text?: unknown; agentId?: unknown; voice?: { provider?: unknown; voice_id?: unknown } };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? speakable(body.text).slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  try {
    let voice: AgentVoice;
    const p = body.voice?.provider;
    const id = body.voice?.voice_id;
    if ((p === "elevenlabs" || p === "openai") && typeof id === "string" && id.trim()) {
      voice = { provider: p, voice_id: id.trim(), voice_name: null, speaking_style: null };
    } else {
      const supabase = await createUserClient();
      voice = await agentVoice(supabase, typeof body.agentId === "string" ? body.agentId : "da_boi");
    }

    const audio = await synthesize(text, voice);
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Voice": `${voice.provider}:${voice.voice_id}`,
      },
    });
  } catch (err) {
    console.error("[agents/tts]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "TTS failed" }, { status: 502 });
  }
}
