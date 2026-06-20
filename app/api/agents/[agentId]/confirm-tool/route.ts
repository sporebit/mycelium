import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { AGENT_SYSTEM_PROMPTS, buildDaBoiPrompt } from "@/lib/agents/prompts";
import { executeTool, toolsForAgent } from "@/lib/agents/tools";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function callClaude(
  system: string,
  messages: { role: string; content: unknown }[],
  tools?: Record<string, unknown>[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  if (!apiKey) return null;

  const body: Record<string, unknown> = { model, max_tokens: 1024, system, messages };
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
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { agentId } = await ctx.params;

  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

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

    let systemPrompt: string;
    if (agentId === "da_boi") {
      const { data: allMemories } = await supabase
        .from("agent_memory")
        .select("agent_id, summary");
      const memMap = new Map<string, string>();
      for (const m of (allMemories ?? []) as { agent_id: string; summary: string }[]) {
        memMap.set(m.agent_id, m.summary);
      }
      systemPrompt = buildDaBoiPrompt({
        fitness_memory: memMap.get("fitness") || "none",
        finance_memory: memMap.get("finance") || "none",
        tasks_memory: memMap.get("tasks") || "none",
        nutrition_memory: memMap.get("nutrition") || "none",
        recent_workouts: "see conversation",
        monthly_spend: "see conversation",
        open_task_count: 0,
        avg_calories: "see conversation",
      });
    } else {
      const { data: memory } = await supabase
        .from("agent_memory")
        .select("summary")
        .eq("agent_id", agentId)
        .single();
      const promptFn = AGENT_SYSTEM_PROMPTS[agentId];
      systemPrompt = promptFn
        ? promptFn(memory?.summary || "No previous memory.")
        : `You are an AI assistant. ${memory?.summary || ""}`;
    }

    const toolResultMsg = result.ok
      ? `Tool "${body.tool_name}" executed successfully: ${result.summary}. Result: ${JSON.stringify(result.result)}. Give the user a brief confirmation of what was created.`
      : `Tool "${body.tool_name}" failed: ${result.summary}. Let the user know.`;

    const apiMessages = [
      ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: toolResultMsg },
    ];

    const tools = toolsForAgent(agentId);
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
