import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { AGENT_SYSTEM_PROMPTS, buildDaBoiPrompt } from "@/lib/agents/prompts";
import { toolsForAgent } from "@/lib/agents/tools";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

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
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  if (!apiKey) return null;

  const body: Record<string, unknown> = { model, max_tokens: maxTokens, system, messages };
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
  return (await res.json()) as ApiResponse;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { agentId } = await ctx.params;

  try {
    const supabase = createServerClient();

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
    });
  } catch (err) {
    console.error("[/api/agents/:agentId GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

async function getDaBoiContext(supabase: ReturnType<typeof createServerClient>) {
  const uid = process.env.USER_ID!;

  const { data: allMemories } = await supabase
    .from("agent_memory")
    .select("agent_id, summary");
  const memMap = new Map<string, string>();
  for (const m of (allMemories ?? []) as { agent_id: string; summary: string }[]) {
    memMap.set(m.agent_id, m.summary);
  }

  const { data: workouts } = await supabase
    .from("workout_sessions")
    .select("date, name, slot, kind, status")
    .eq("user_id", uid)
    .order("date", { ascending: false })
    .limit(5);
  const recentWorkouts = (workouts ?? [])
    .map((w: Record<string, unknown>) => `${w.date}: ${w.name} (${w.kind}, ${w.status})`)
    .join("; ") || "none";

  let monthlySpend = "unknown";
  try {
    const { data: spendData } = await supabase.rpc("txn_agg", {
      p_user_id: uid,
      p_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      p_to: new Date().toISOString().slice(0, 10),
    });
    if (spendData && typeof spendData === "object" && "total" in (spendData as Record<string, unknown>)) {
      monthlySpend = `£${(spendData as { total: number }).total.toFixed(2)}`;
    }
  } catch { /* RPC may not exist */ }

  let openTaskCount = 0;
  try {
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .is("completed_at", null);
    openTaskCount = count ?? 0;
  } catch { /* table may differ */ }

  let avgCalories = "unknown";
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: nutritionData } = await supabase
      .from("nutrition_logs")
      .select("calories")
      .eq("user_id", uid)
      .gte("logged_at", sevenDaysAgo.toISOString());
    if (nutritionData && nutritionData.length > 0) {
      const total = (nutritionData as { calories: number }[]).reduce((s, n) => s + (n.calories || 0), 0);
      avgCalories = `${Math.round(total / nutritionData.length)} kcal`;
    }
  } catch { /* table may differ */ }

  return buildDaBoiPrompt({
    fitness_memory: memMap.get("fitness") || "none",
    finance_memory: memMap.get("finance") || "none",
    tasks_memory: memMap.get("tasks") || "none",
    nutrition_memory: memMap.get("nutrition") || "none",
    recent_workouts: recentWorkouts,
    monthly_spend: monthlySpend,
    open_task_count: openTaskCount,
    avg_calories: avgCalories,
  });
}

const TOOL_CAPABILITY_SUFFIX =
  "\n\nYou have tools available to create tasks and records in Mycelium directly. When the user asks you to create something, first describe what you plan to create and ask for confirmation. Only call the tool after they confirm.";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
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
    const supabase = createServerClient();

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

    let systemPrompt: string;
    if (agentId === "da_boi") {
      systemPrompt = await getDaBoiContext(supabase);
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

    const tools = toolsForAgent(agentId);
    if (tools.length > 0) {
      systemPrompt += TOOL_CAPABILITY_SUFFIX;
    }

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
