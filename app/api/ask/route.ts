import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getQueryEmbedding } from "@/lib/memory/embedCache";
import { searchChunks, enrichSources, buildMatches } from "@/lib/memory/search";
import type { AskSource, SearchMatch } from "@/lib/memory/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ANTHROPIC_TIMEOUT_MS = 30_000;
const CHUNK_MAX_CHARS = 800; // ~200 tokens per the spec
const TOP_K = 20;

const SYSTEM_PROMPT = `You are the user's personal AI assistant with access to their historical captures, tasks, and notes. Answer the user's question using ONLY the context provided.

Citation rules:
- Cite specific memories using their tag, e.g. [C3].
- If the context doesn't contain the answer, say so directly. Don't speculate, don't invent.
- Be concise. The user has a short attention span and a busy day.
- When citing dates, use natural language ("last Tuesday", "3 weeks ago").
- If multiple sources contradict, surface the contradiction rather than picking one.`;

function shortDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function snippetFor(match: SearchMatch): string {
  let text = match.chunk.text ?? "";
  if (match.source?.type === "task") {
    const desc = match.source.description ?? "";
    text = `${match.source.title}${desc ? `\n${desc}` : ""}`;
  } else if (match.source?.type === "capture") {
    text = match.source.raw_text ?? text;
  }
  text = text.trim();
  if (text.length > CHUNK_MAX_CHARS) {
    text = text.slice(0, CHUNK_MAX_CHARS) + "…";
  }
  return text;
}

function buildContextBlock(sources: AskSource[]): string {
  const lines: string[] = [];
  for (const s of sources) {
    const typeLabel =
      s.source?.type === "task"
        ? "TASK"
        : s.source?.type === "capture"
          ? "CAPTURE"
          : (s.chunk.source_type ?? "NOTE").toUpperCase();
    lines.push(
      `[${s.citation_tag}] ${typeLabel} · ${shortDate(s.chunk.created_at)}`
    );
    lines.push(snippetFor(s));
    lines.push("");
  }
  return lines.join("\n");
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function streamFromAnthropic(
  userMessage: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) {
    controller.enqueue(
      encoder.encode(
        sseEvent({ type: "error", message: "Anthropic not configured" })
      )
    );
    return;
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        stream: true,
      }),
      signal: abort.signal,
    });

    if (!res.ok || !res.body) {
      controller.enqueue(
        encoder.encode(
          sseEvent({
            type: "error",
            message: `Anthropic error (${res.status})`,
          })
        )
      );
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as {
            type?: string;
            delta?: { type?: string; text?: string };
          };
          if (
            evt.type === "content_block_delta" &&
            evt.delta?.type === "text_delta" &&
            typeof evt.delta.text === "string"
          ) {
            controller.enqueue(
              encoder.encode(
                sseEvent({ type: "token", content: evt.delta.text })
              )
            );
          }
        } catch {
          /* skip malformed event */
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "stream failed";
    controller.enqueue(encoder.encode(sseEvent({ type: "error", message })));
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return Response.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: { question?: unknown };
  try {
    body = (await req.json()) as { question?: unknown };
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return Response.json({ error: "question required" }, { status: 400 });
  }

  let sources: AskSource[] = [];
  try {
    const embedding = await getQueryEmbedding(question);
    const supabase = createServerClient();
    const chunks = await searchChunks(supabase, uid, embedding, TOP_K, 0.25);
    const enrichedMap = await enrichSources(supabase, chunks);
    const matches = buildMatches(chunks, enrichedMap);
    sources = matches.map((m, i) => ({
      ...m,
      citation_tag: `C${i + 1}`,
    }));
  } catch (err) {
    console.error("[/api/ask] retrieval failed:", err);
    return Response.json({ error: "retrieval failed" }, { status: 500 });
  }

  const userMessage =
    sources.length === 0
      ? `Question: ${question}\n\nContext: (none — the user's memory contains no relevant chunks)`
      : `Question: ${question}\n\nContext:\n${buildContextBlock(sources)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send sources first so the UI can render the panel as tokens stream.
      controller.enqueue(encoder.encode(sseEvent({ type: "sources", sources })));
      await streamFromAnthropic(userMessage, controller, encoder);
      controller.enqueue(encoder.encode(sseEvent({ type: "done" })));
      controller.close();
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
