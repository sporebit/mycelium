import { describe, expect, it } from "vitest";
import { readAnthropicStream } from "./anthropicStream";

const ev = (o: unknown) => `event: x\ndata: ${JSON.stringify(o)}\n\n`;

/** A body that delivers the text in the given chunks, so events straddle reads. */
function bodyOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

const TEXT_TURN =
  ev({ type: "message_start", message: { usage: { input_tokens: 12, cache_read_input_tokens: 900 } } }) +
  ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
  ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Two things " } }) +
  ev({ type: "ping" }) +
  ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "for today." } }) +
  ev({ type: "content_block_stop", index: 0 }) +
  ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 7 } }) +
  ev({ type: "message_stop" });

describe("readAnthropicStream (MYC-148)", () => {
  it("assembles text, calls onText per delta, and merges usage", async () => {
    const deltas: string[] = [];
    const r = await readAnthropicStream(bodyOf([TEXT_TURN]), (d) => deltas.push(d));
    expect(r.text).toBe("Two things for today.");
    expect(deltas).toEqual(["Two things ", "for today."]);
    expect(r.tool).toBeNull();
    expect(r.usage).toEqual({ input_tokens: 12, cache_read_input_tokens: 900, output_tokens: 7 });
  });

  it("is chunk-boundary safe: the same events split mid-line give the same result", async () => {
    const chunks: string[] = [];
    for (let i = 0; i < TEXT_TURN.length; i += 17) chunks.push(TEXT_TURN.slice(i, i + 17));
    const r = await readAnthropicStream(bodyOf(chunks));
    expect(r.text).toBe("Two things for today.");
    expect(r.usage.output_tokens).toBe(7);
  });

  it("collects a tool_use block's input from json deltas alongside the text", async () => {
    const s =
      ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
      ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I'll add that. Shall I?" } }) +
      ev({ type: "content_block_stop", index: 0 }) +
      ev({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "create_task", input: {} } }) +
      ev({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"title": "Book the ' } }) +
      ev({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'dentist", "urgency": "this_week"}' } }) +
      ev({ type: "content_block_stop", index: 1 }) +
      ev({ type: "message_stop" });
    const r = await readAnthropicStream(bodyOf([s]));
    expect(r.text).toBe("I'll add that. Shall I?");
    expect(r.tool).toEqual({ id: "toolu_1", name: "create_task", input: { title: "Book the dentist", urgency: "this_week" }, truncated: false });
  });

  it("flags a tool whose input was cut off, and ignores text deltas inside a tool block", async () => {
    const s =
      ev({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_2", name: "create_task", input: {} } }) +
      ev({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"title": "Half' } });
    const r = await readAnthropicStream(bodyOf([s]));
    expect(r.text).toBe("");
    expect(r.tool).toEqual({ id: "toolu_2", name: "create_task", input: {}, truncated: true });
  });

  it("skips malformed and non-data lines", async () => {
    const s = "data: {not json}\n\n: comment\n\n" + ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } });
    const r = await readAnthropicStream(bodyOf([s]));
    expect(r.text).toBe("ok");
  });
});
