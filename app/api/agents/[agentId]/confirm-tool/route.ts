import { NextRequest, NextResponse } from "next/server";
import { MODEL_CHAT } from "@/lib/config/models";
import { createUserClient } from "@/lib/supabase/user";
import { buildAgentSystemPrompt } from "@/lib/agents/system";
import { executeTool } from "@/lib/agents/tools";

export const runtime = "nodejs";

async function callClaude(
  system: string,
  messages: { role: string; content: unknown }[],
  tools?: Record<string, unknown>[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = MODEL_CHAT;
  if (!apiKey) return null;

  // Same prefix the main agent route writes (tools -> system), so this call
  // reads that cache rather than paying full price for it again.
  const body: Record<string, unknown> = {
    model,
    max_tokens: 1024,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  return json.content?.find((b) => b.type === "text")?.text ?? null;
}

type ConfirmBody = {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  confirmed: boolean;
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await ctx.params;

  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();

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
    const conversationId = conv.id as string;

    if (!body.confirmed) {
      await supabase.from("agent_messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: `[Declined tool: ${body.tool_name}]`,
      });
      await supabase.from("agent_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: "No problem — I won't do that. Is there anything else?",
      });
      return NextResponse.json({
        reply: "No problem — I won't do that. Is there anything else?",
      });
    }

    const result = await executeTool(body.tool_name, body.tool_input);

    await supabase.from("agent_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: `[Confirmed tool: ${body.tool_name}]`,
    });

    const { data: history } = await supabase
      .from("agent_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);
    const chatMessages = (history ?? []) as { role: string; content: string }[];

    // A tool confirmation continues an existing conversation, so there is no
    // fresh message to scope Da Boi's domains against — the builder keeps
    // every summary and omits live data (the transcript already carries it).
    const { system: systemPrompt, tools } = await buildAgentSystemPrompt(supabase, agentId);

    const toolResultMsg = result.ok
      ? `Tool "${body.tool_name}" executed successfully: ${result.summary}. Result: ${JSON.stringify(result.result)}. Give the user a brief confirmation of what was created.`
      : `Tool "${body.tool_name}" failed: ${result.summary}. Let the user know.`;

    const apiMessages = [
      ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: toolResultMsg },
    ];

    const followUp = await callClaude(systemPrompt, apiMessages, tools);
    const reply = followUp || result.summary;

    await supabase.from("agent_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: reply,
    });

    return NextResponse.json({ reply, result: result.result, ok: result.ok });
  } catch (err) {
    console.error("[/api/agents/:agentId/confirm-tool POST]", err);
    return NextResponse.json({ error: "tool execution failed" }, { status: 500 });
  }
}
