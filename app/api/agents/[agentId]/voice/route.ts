import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { agentVoice, elevenLabsConfigured, writeAgentVoice, type AgentVoice } from "@/lib/agents/voice";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    return NextResponse.json({ voice: await agentVoice(supabase, agentId) });
  } catch (err) {
    console.error("[agents/voice GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** Set the agent's voice and/or manner for the caller (MYC-149). Any subset of the four fields. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const patch: Partial<AgentVoice> = {};
  if ("provider" in body) {
    if (body.provider !== "elevenlabs" && body.provider !== "openai") return NextResponse.json({ error: "provider must be elevenlabs or openai" }, { status: 400 });
    if (body.provider === "elevenlabs" && !elevenLabsConfigured()) return NextResponse.json({ error: "ElevenLabs is not configured on the server" }, { status: 400 });
    patch.provider = body.provider;
  }
  if ("voice_id" in body) {
    if (typeof body.voice_id !== "string" || !body.voice_id.trim()) return NextResponse.json({ error: "voice_id required" }, { status: 400 });
    patch.voice_id = body.voice_id.trim();
  }
  if ("voice_name" in body) patch.voice_name = typeof body.voice_name === "string" && body.voice_name.trim() ? body.voice_name.trim() : null;
  if ("speaking_style" in body) {
    if (body.speaking_style !== null && typeof body.speaking_style !== "string") return NextResponse.json({ error: "speaking_style must be text" }, { status: 400 });
    patch.speaking_style = typeof body.speaking_style === "string" && body.speaking_style.trim() ? body.speaking_style.trim().slice(0, 1200) : null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to change" }, { status: 400 });

  try {
    const supabase = await createUserClient();
    const { data: agent } = await supabase.from("agents").select("id").eq("id", agentId).single();
    if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });
    const voice = await writeAgentVoice(supabase, agentId, patch);
    if (!voice) return NextResponse.json({ error: "invalid voice" }, { status: 400 });
    return NextResponse.json({ voice });
  } catch (err) {
    console.error("[agents/voice PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
