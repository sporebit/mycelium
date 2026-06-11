import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { MEMORY_UPDATE_PROMPT } from "@/lib/agents/prompts";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function callClaude(
  system: string,
  messages: { role: string; content: string }[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  if (!apiKey) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  return json.content?.find((b) => b.type === "text")?.text ?? null;
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { agentId } = await ctx.params;

  try {
    const supabase = createServerClient();

    const { data: conv } = await supabase
      .from("agent_conversations")
      .select("id")
      .eq("agent_id", agentId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv) {
      return NextResponse.json({ error: "no open conversation" }, { status: 404 });
    }

    await supabase
      .from("agent_conversations")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", conv.id);

    const { data: msgs } = await supabase
      .from("agent_messages")
      .select("role, content")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    const chatMessages = (msgs ?? []) as { role: string; content: string }[];

    const { data: memory } = await supabase
      .from("agent_memory")
      .select("summary")
      .eq("agent_id", agentId)
      .single();
    const existingSummary = memory?.summary || "";

    const memoryPrompt = `Existing memory summary:\n${existingSummary || "(empty — first conversation)"}\n\nConversation transcript:\n${chatMessages.map((m) => `${m.role}: ${m.content}`).join("\n")}`;

    const updatedSummary = await callClaude(MEMORY_UPDATE_PROMPT, [
      { role: "user", content: memoryPrompt },
    ]);

    if (updatedSummary) {
      await supabase
        .from("agent_memory")
        .update({ summary: updatedSummary, updated_at: new Date().toISOString() })
        .eq("agent_id", agentId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/agents/:agentId/end-session POST]", err);
    return NextResponse.json({ error: "end session failed" }, { status: 500 });
  }
}
