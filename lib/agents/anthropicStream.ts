/**
 * Read an Anthropic Messages streaming body (server-sent events) into the
 * reply text, at most one tool call, and the usage counters. Text deltas are
 * handed to `onText` as they arrive; everything else is assembled and
 * returned when the stream ends. Pure apart from the reader, so it is
 * tested with synthetic streams (MYC-148).
 */

export type StreamedTool = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** The input JSON did not parse — the stream was cut before the block ended. */
  truncated: boolean;
};

export type StreamResult = { text: string; tool: StreamedTool | null; usage: Record<string, number> };

type Event = {
  type?: string;
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string };
  message?: { usage?: Record<string, number> };
  usage?: Record<string, number>;
};

export async function readAnthropicStream(body: ReadableStream<Uint8Array>, onText?: (delta: string) => void): Promise<StreamResult> {
  let text = "";
  let tool: { id: string; name: string; json: string } | null = null;
  let inTool = false;
  const usage: Record<string, number> = {};

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;
      let evt: Event;
      try {
        evt = JSON.parse(payload) as Event;
      } catch {
        continue;
      }
      switch (evt.type) {
        case "message_start":
          Object.assign(usage, evt.message?.usage ?? {});
          break;
        case "content_block_start":
          inTool = evt.content_block?.type === "tool_use";
          // One pending tool per turn, as the JSON route stores it.
          if (inTool && !tool) tool = { id: evt.content_block?.id ?? "", name: evt.content_block?.name ?? "", json: "" };
          break;
        case "content_block_delta":
          if (evt.delta?.type === "text_delta" && typeof evt.delta.text === "string") {
            text += evt.delta.text;
            onText?.(evt.delta.text);
          } else if (evt.delta?.type === "input_json_delta" && inTool && tool && typeof evt.delta.partial_json === "string") {
            tool.json += evt.delta.partial_json;
          }
          break;
        case "content_block_stop":
          inTool = false;
          break;
        case "message_delta":
          Object.assign(usage, evt.usage ?? {});
          break;
      }
    }
  }

  if (!tool) return { text, tool: null, usage };
  let input: Record<string, unknown> = {};
  let truncated = false;
  try {
    input = tool.json.trim() ? (JSON.parse(tool.json) as Record<string, unknown>) : {};
  } catch {
    truncated = true;
  }
  return { text, tool: { id: tool.id, name: tool.name, input, truncated }, usage };
}
