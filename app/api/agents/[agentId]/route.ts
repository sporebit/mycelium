import { NextRequest, NextResponse } from "next/server";
import { MODEL_CHAT } from "@/lib/config/models";
import { createUserClient } from "@/lib/supabase/user";
import { buildAgentSystemPrompt } from "@/lib/agents/system";
import { agentVoice } from "@/lib/agents/voice";

export const runtime = "nodejs";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

type ApiResponse = {
  content?: ContentBlock[];
  stop_reason?: string;
};

async function callClaude(
  system: string,
  messages: { role: string; content: unknown }[],
  tools?: Record<string, unknown>[],
  maxTokens = 1024,
): Promise<ApiResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = MODEL_CHAT;
  if (!apiKey) return null;

  // Prompt caching. The cache prefix renders tools -> system -> messages, so a
  // breakpoint on the system block covers the tool definitions too. Within a
  // conversation the agent memory summary is fixed (it is only rewritten at
  // end-session), so tools + system are byte-stable across turns and every
  // turn after the first reads the prefix from cache.
  //
  // Sonnet 4.5 needs a 1024-token prefix or the marker is silently ignored.
  // Measured: tools + persona + TOOL_CAPABILITY_SUFFIX (~680 tokens) clears
  // that for every agent except "fitness", which ships a single tool and
  // lands around 950 — it simply won't cache, which costs nothing.
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: "auto" };
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

  if (!res.ok) {
    console.error("[agents/callClaude] API error", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as ApiResponse;
  // If cache_read stays 0 across turns of one conversation, something in the
  // prefix is varying — see lib/agents/prompts.ts before blaming the API.
  const u = (json as { usage?: Record<string, number> }).usage;
  if (u) {
    console.log(
      "[agents/callClaude] cache write=%d read=%d uncached=%d",
      u.cache_creation_input_tokens ?? 0,
      u.cache_read_input_tokens ?? 0,
      u.input_tokens ?? 0,
    );
  }
  return json;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await ctx.params;

  try {
    const supabase = await createUserClient();

    const { data: agent } = await supabase
      .from("agents")
      .select("id, display_name, tagline, accent_colour")
      .eq("id", agentId)
      .single();
    if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });

    const { data: memory } = await supabase
      .from("agent_memory")
      .select("summary, updated_at")
      .eq("agent_id", agentId)
      .single();

    const { data: conv } = await supabase
      .from("agent_conversations")
      .select("id, started_at")
      .eq("agent_id", agentId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let messages: { id: string; role: string; content: string; created_at: string }[] = [];
    if (conv) {
      const { data: msgs } = await supabase
        .from("agent_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .limit(50);
      messages = (msgs ?? []) as typeof messages;
    }

    return NextResponse.json({
      agent,
      memory: memory?.summary ?? "",
      memoryUpdatedAt: memory?.updated_at ?? null,
      conversationId: conv?.id ?? null,
      messages,
      voice: await agentVoice(supabase, agentId),
    });
  } catch (err) {
    console.error("[/api/agents/:agentId GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await ctx.params;

  let body: { message?: string };
  try {
    body = (await req.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const userMessage = body.message?.trim();
  if (!userMessage) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();

    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .single();
    if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });

    const conv = await supabase
      .from("agent_conversations")
      .select("id")
      .eq("agent_id", agentId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;
    if (conv.data) {
      conversationId = conv.data.id as string;
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from("agent_conversations")
        .insert({ agent_id: agentId })
        .select("id")
        .single();
      if (convErr || !newConv) throw convErr ?? new Error("conversation create failed");
      conversationId = newConv.id as string;
    }

    await supabase.from("agent_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: userMessage,
    });

    const { data: history } = await supabase
      .from("agent_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);
    const chatMessages = (history ?? []) as { role: string; content: string }[];

    const { system: systemPrompt, tools } = await buildAgentSystemPrompt(supabase, agentId, { userMessage });

    const apiMessages = chatMessages.map((m) => ({ role: m.role, content: m.content }));
    const response = await callClaude(systemPrompt, apiMessages, tools);
    if (!response?.content) {
      return NextResponse.json({ error: "AI response failed" }, { status: 502 });
    }

    const textBlock = response.content.find((b) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    const toolBlock = response.content.find((b) => b.type === "tool_use") as
      | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
      | undefined;

    const replyText = textBlock?.text ?? "";

    if (toolBlock) {
      const storeContent = JSON.stringify({
        text: replyText,
        pending_tool: {
          tool_use_id: toolBlock.id,
          tool_name: toolBlock.name,
          tool_input: toolBlock.input,
        },
      });
      await supabase.from("agent_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: storeContent,
      });

      return NextResponse.json({
        reply: replyText,
        conversationId,
        pending_tool: {
          tool_use_id: toolBlock.id,
          tool_name: toolBlock.name,
          tool_input: toolBlock.input,
        },
      });
    }

    if (replyText) {
      await supabase.from("agent_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: replyText,
      });
    }

    return NextResponse.json({ reply: replyText, conversationId });
  } catch (err) {
    console.error("[/api/agents/:agentId POST]", err);
    return NextResponse.json({ error: "chat failed" }, { status: 500 });
  }
}
