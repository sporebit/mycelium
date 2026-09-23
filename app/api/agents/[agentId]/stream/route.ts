import { NextRequest } from "next/server";
import { MODEL_CHAT } from "@/lib/config/models";
import { createUserClient } from "@/lib/supabase/user";
import { buildAgentSystemPrompt } from "@/lib/agents/system";
import { readAnthropicStream } from "@/lib/agents/anthropicStream";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One agent turn as server-sent events (MYC-148). The same conversation and
 * message rows as the JSON route, but the reply arrives token by token so a
 * voice client can start speaking the first sentence while the rest is
 * still being written.
 *
 * Events: `{type:"token", content}` per text delta, then one
 * `{type:"done", conversationId, reply, pending_tool?}`, or `{type:"error"}`.
 * A tool call is not executed here — it is stored as a pending tool exactly
 * like the JSON route, for the client to confirm through `confirm-tool`.
 */
const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

export async function POST(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await ctx.params;

  let body: { message?: unknown; spoken?: unknown };
  try {
    body = (await req.json()) as { message?: unknown; spoken?: unknown };
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const userMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!userMessage) return Response.json({ error: "message required" }, { status: 400 });
  const spoken = body.spoken === true;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY missing" }, { status: 500 });

  const supabase = await createUserClient();
  const { data: agent } = await supabase.from("agents").select("id").eq("id", agentId).single();
  if (!agent) return Response.json({ error: "agent not found" }, { status: 404 });

  let conversationId: string;
  const conv = await supabase
    .from("agent_conversations")
    .select("id")
    .eq("agent_id", agentId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conv.data) {
    conversationId = conv.data.id as string;
  } else {
    const { data: created, error } = await supabase.from("agent_conversations").insert({ agent_id: agentId }).select("id").single();
    if (error || !created) return Response.json({ error: "conversation create failed" }, { status: 500 });
    conversationId = created.id as string;
  }

  await supabase.from("agent_messages").insert({ conversation_id: conversationId, role: "user", content: userMessage });

  const { data: history } = await supabase
    .from("agent_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(50);
  const messages = ((history ?? []) as { role: string; content: string }[]).map((m) => ({ role: m.role, content: m.content }));

  const { system, tools } = await buildAgentSystemPrompt(supabase, agentId, { userMessage, spoken });

  const request: Record<string, unknown> = {
    model: MODEL_CHAT,
    max_tokens: spoken ? 400 : 1024,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    stream: true,
  };
  if (tools.length > 0) {
    request.tools = tools;
    request.tool_choice = { type: "auto" };
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(sse(o)));
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 55_000);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          console.error("[agents/stream] API error", res.status, await res.text());
          send({ type: "error", message: `Anthropic error (${res.status})` });
          return;
        }

        const { text, tool, usage } = await readAnthropicStream(res.body, (delta) => send({ type: "token", content: delta }));

        console.log(
          "[agents/stream] cache write=%d read=%d uncached=%d out=%d",
          usage.cache_creation_input_tokens ?? 0,
          usage.cache_read_input_tokens ?? 0,
          usage.input_tokens ?? 0,
          usage.output_tokens ?? 0,
        );

        // A truncated tool input is stored with empty input: confirming it
        // fails cleanly in confirm-tool and the model re-asks.
        const pending = tool ? { tool_use_id: tool.id, tool_name: tool.name, tool_input: tool.input } : null;

        if (pending) {
          await supabase.from("agent_messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: JSON.stringify({ text, pending_tool: pending }),
          });
        } else if (text) {
          await supabase.from("agent_messages").insert({ conversation_id: conversationId, role: "assistant", content: text });
        }

        send({ type: "done", conversationId, reply: text, pending_tool: pending ?? undefined });
      } catch (err) {
        console.error("[agents/stream]", err);
        send({ type: "error", message: err instanceof Error ? err.message : "stream failed" });
      } finally {
        clearTimeout(timer);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
