import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { defaultVoice, deleteClonedVoice, readAgentVoices, writeAgentVoice } from "@/lib/agents/voice";

export const runtime = "nodejs";

/** Remove a cloned voice; any agent using it goes back to its stock voice, keeping its manner. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ voiceId: string }> }) {
  const { voiceId } = await ctx.params;
  if (!voiceId) return NextResponse.json({ error: "voice id required" }, { status: 400 });
  try {
    const ok = await deleteClonedVoice(voiceId);
    if (!ok) return NextResponse.json({ error: "delete failed" }, { status: 502 });

    const supabase = await createUserClient();
    const stored = await readAgentVoices(supabase);
    const reset: string[] = [];
    for (const [agentId, v] of Object.entries(stored)) {
      if (v.provider === "elevenlabs" && v.voice_id === voiceId) {
        await writeAgentVoice(supabase, agentId, defaultVoice(agentId, v.speaking_style));
        reset.push(agentId);
      }
    }
    return NextResponse.json({ ok: true, reset });
  } catch (err) {
    console.error("[agents/voices DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
