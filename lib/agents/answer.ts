/**
 * One agent's answer to one message, in full (no stream), for places that
 * cannot take tokens one at a time: the Boys' Telegram group. The same
 * conversation and message rows as the web chat, so the agent remembers
 * the group as it remembers the page. No tools here: a tool needs the
 * confirm step the web chat has, and a group message has nowhere to put it.
 *
 * The call goes out through the one fetch the meter wraps (MYC-187), like
 * every other paid call.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL_CHAT } from "@/lib/config/models";
import { buildAgentSystemPrompt } from "./system";

type ContentBlock = { type: "text"; text: string } | { type: string };

export const GROUP_SUFFIX = "\n\nYou are answering in a Telegram group chat with Phil and the other agents. Keep it to a few short lines: it is a chat, not a report. Plain text, no markdown. You have no tools here; if something would need one, say what you would do and that it is done from the app.";

async function openConversation(db: SupabaseClient, agentId: string): Promise<string> {
  const { data: conv } = await db.from("agent_conversations").select("id").eq("agent_id", agentId).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (conv) return conv.id as string;
  const { data, error } = await db.from("agent_conversations").insert({ agent_id: agentId }).select("id").single();
  if (error || !data) throw new Error(`conversation: ${error?.message ?? "insert failed"}`);
  return data.id as string;
}

export async function answerAs(db: SupabaseClient, agentId: string, userMessage: string, opts: { fetchImpl?: typeof fetch; maxTokens?: number } = {}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const f = opts.fetchImpl ?? fetch;

  const conversationId = await openConversation(db, agentId);
  await db.from("agent_messages").insert({ conversation_id: conversationId, role: "user", content: userMessage });
  const { data: history } = await db.from("agent_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(40);
  const messages = ((history ?? []) as { role: string; content: string }[]).map((m) => ({ role: m.role, content: m.content }));

  const { system } = await buildAgentSystemPrompt(db, agentId, { userMessage, spoken: true });
  const res = await f("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_CHAT,
      max_tokens: opts.maxTokens ?? 400,
      system: [{ type: "text", text: system + GROUP_SUFFIX, cache_control: { type: "ephemeral" } }],
      messages,
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) throw new Error(`Anthropic error (${res.status})`);
  const json = (await res.json()) as { content?: ContentBlock[] };
  const text = (json.content ?? [])
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (text) await db.from("agent_messages").insert({ conversation_id: conversationId, role: "assistant", content: text });
  return text;
}
