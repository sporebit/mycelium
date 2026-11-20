import { describe, expect, it } from "vitest";
import { capRefusalBody, meteredCall, overCap, requestFacts, thresholdsReached, usageFromAnthropicStream, usageFromJson, usageFromSpeech } from "./meterRules";
import { costPence } from "./usage";

describe("which calls are metered", () => {
  it("the paid endpoints of the three services, and nothing else", () => {
    expect(meteredCall("https://api.anthropic.com/v1/messages")).toEqual({ provider: "anthropic", endpoint: "messages" });
    expect(meteredCall("https://api.openai.com/v1/chat/completions")).toEqual({ provider: "openai", endpoint: "chat" });
    expect(meteredCall("https://api.openai.com/v1/embeddings")).toEqual({ provider: "openai", endpoint: "embeddings" });
    expect(meteredCall("https://api.openai.com/v1/audio/transcriptions")).toEqual({ provider: "openai", endpoint: "transcriptions" });
    expect(meteredCall("https://api.openai.com/v1/audio/speech")).toEqual({ provider: "openai", endpoint: "speech" });
    expect(meteredCall("https://api.elevenlabs.io/v1/text-to-speech/abc123/stream")).toEqual({ provider: "elevenlabs", endpoint: "speech" });
  });
  it("free calls to the same services, and every other address, pass untouched", () => {
    for (const url of [
      "https://api.elevenlabs.io/v1/voices",
      "https://api.openai.com/v1/models",
      "https://api.anthropic.com/v1/models",
      "https://vokfwbkwuccikordcnxz.supabase.co/rest/v1/tickets",
      "https://api.telegram.org/bot123/sendMessage",
      "http://127.0.0.1:11434/api/chat",
      "/api/daily/today",
      "not a url",
    ]) {
      expect(meteredCall(url), url).toBeNull();
    }
  });
});

describe("what a call cost", () => {
  it("a Claude reply: tokens at the model's price", () => {
    const u = usageFromJson({ provider: "anthropic", endpoint: "messages" }, { model: "claude-haiku-4-5-20251001", usage: { input_tokens: 1000, output_tokens: 200 } });
    expect(u).toMatchObject({ model: "claude-haiku-4-5-20251001", input_tokens: 1000, output_tokens: 200, estimated: false });
    expect(u!.cost_pence).toBe(costPence("claude-haiku-4-5-20251001", 1000, 200));
  });

  it("a Claude reply with caching: writes cost a quarter more than input, reads a tenth", () => {
    const u = usageFromJson({ provider: "anthropic", endpoint: "messages" }, { model: "claude-sonnet-4-5", usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 1000, cache_read_input_tokens: 2000 } })!;
    expect(u.input_tokens).toBe(3100);
    expect(u.cost_pence).toBe(costPence("claude-sonnet-4-5", 100 + 1250 + 200, 50));
    expect(u.meta).toEqual({ cache_written: 1000, cache_read: 2000 });
  });

  it("a reply with no usage in it is not guessed at", () => {
    expect(usageFromJson({ provider: "anthropic", endpoint: "messages" }, { type: "error", error: { type: "overloaded_error" } })).toBeNull();
    expect(usageFromJson({ provider: "openai", endpoint: "chat" }, {})).toBeNull();
  });

  it("an embedding: two cents a million tokens", () => {
    const u = usageFromJson({ provider: "openai", endpoint: "embeddings" }, { model: "text-embedding-3-small", usage: { total_tokens: 1_000_000 } })!;
    expect(u.cost_pence).toBe(costPence(null, 0, 0, 0.02));
    expect(u.input_tokens).toBe(1_000_000);
  });

  it("a transcription: by the length the provider reports, else by the size sent, marked as an estimate", () => {
    const told = usageFromJson({ provider: "openai", endpoint: "transcriptions" }, { text: "hello", duration: 120 })!;
    expect(told.cost_pence).toBe(costPence(null, 0, 0, 2 * 0.006));
    expect(told.estimated).toBe(false);
    // 240,000 bytes at the assumed 32 kbit/s is one minute.
    const sized = usageFromJson({ provider: "openai", endpoint: "transcriptions" }, { text: "hello" }, { audioBytes: 240_000 })!;
    expect(sized.cost_pence).toBe(costPence(null, 0, 0, 0.006));
    expect(sized.estimated).toBe(true);
    expect(usageFromJson({ provider: "openai", endpoint: "transcriptions" }, { text: "hello" })).toBeNull();
  });

  it("an unpriced chat model is costed at the dearer fallback rate, never as free", () => {
    const u = usageFromJson({ provider: "openai", endpoint: "chat" }, { model: "gpt-something-new", usage: { prompt_tokens: 1000, completion_tokens: 1000 } })!;
    expect(u.cost_pence).toBe(costPence(null, 1000, 1000));
    expect(u.cost_pence).toBeGreaterThan(0);
  });

  it("speech: by the characters sent; a subscription service is counted in characters, not pence", () => {
    expect(usageFromSpeech({ provider: "openai", endpoint: "speech" }, { model: "tts-1", chars: 1_000_000 })!.cost_pence).toBe(costPence(null, 0, 0, 15));
    expect(usageFromSpeech({ provider: "elevenlabs", endpoint: "speech" }, { chars: 500 })).toMatchObject({ cost_pence: 0, meta: { chars: 500, subscription: true } });
    expect(usageFromSpeech({ provider: "openai", endpoint: "speech" }, {})).toBeNull();
  });
});

describe("a Claude event stream", () => {
  const stream = [
    "event: message_start",
    'data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-5","usage":{"input_tokens":320,"output_tokens":1,"cache_read_input_tokens":1000}}}',
    "",
    "event: content_block_delta",
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
    "",
    "event: message_delta",
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":57}}',
    "",
    "event: message_stop",
    'data: {"type":"message_stop"}',
  ].join("\n");

  it("input from the start, the last running output total, the model", () => {
    const u = usageFromAnthropicStream(stream)!;
    expect(u.model).toBe("claude-sonnet-4-5");
    expect(u.output_tokens).toBe(57);
    expect(u.input_tokens).toBe(1320);
    expect(u.cost_pence).toBe(costPence("claude-sonnet-4-5", 320 + 100, 57));
  });

  it("a stream cut short still counts what it was told; rubbish counts nothing", () => {
    const cut = stream.split("\n").slice(0, 3).join("\n");
    expect(usageFromAnthropicStream(cut)).toMatchObject({ input_tokens: 1320, output_tokens: 1 });
    expect(usageFromAnthropicStream("data: not json\n\ndata: [DONE]")).toBeNull();
    expect(usageFromAnthropicStream("")).toBeNull();
  });
});

describe("what a request says about itself", () => {
  it("the model, whether it streams, and how much is to be spoken", () => {
    expect(requestFacts(JSON.stringify({ model: "claude-sonnet-4-5", stream: true, messages: [] }))).toEqual({ model: "claude-sonnet-4-5", chars: undefined, stream: true });
    expect(requestFacts(JSON.stringify({ model: "tts-1", input: "Hello there" }))).toMatchObject({ model: "tts-1", chars: 11, stream: false });
    expect(requestFacts(JSON.stringify({ model_id: "eleven_flash_v2_5", text: "Hi" }))).toMatchObject({ model: "eleven_flash_v2_5", chars: 2 });
    expect(requestFacts("not json")).toEqual({});
    expect(requestFacts(undefined)).toEqual({});
  });
  it("the size of the audio in a form", () => {
    const form = new FormData();
    form.set("model", "whisper-1");
    form.set("file", new Blob([new Uint8Array(1000)]), "a.m4a");
    expect(requestFacts(form)).toEqual({ model: "whisper-1", audioBytes: 1000 });
  });
});

describe("the cap", () => {
  it("at the cap the call is not made; a cap of nought stops everything", () => {
    expect(overCap({ spent_pence: 499.9, cap_pence: 500 })).toBe(false);
    expect(overCap({ spent_pence: 500, cap_pence: 500 })).toBe(true);
    expect(overCap({ spent_pence: 0, cap_pence: 0 })).toBe(true);
  });
  it("alerts at four-fifths and at the whole", () => {
    expect(thresholdsReached({ spent_pence: 399, cap_pence: 500 })).toEqual([]);
    expect(thresholdsReached({ spent_pence: 400, cap_pence: 500 })).toEqual([80]);
    expect(thresholdsReached({ spent_pence: 512, cap_pence: 500 })).toEqual([80, 100]);
    expect(thresholdsReached({ spent_pence: 10, cap_pence: 0 })).toEqual([]);
  });
  it("the refusal reads like a provider error and says what happened in plain words", () => {
    const body = JSON.parse(capRefusalBody({ spent_pence: 512.4, cap_pence: 500 })) as { type: string; error: { type: string; message: string } };
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("cloud_cap_reached");
    expect(body.error.message).toBe("This month's cloud AI cap is spent (£5.12 of £5.00). Nothing was sent. It resets on the 1st.");
  });
});
