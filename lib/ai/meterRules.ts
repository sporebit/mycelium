/**
 * What a paid AI call is, and what it cost (master run §9: a hard monthly
 * cloud-AI cap of £5, enforced from api_usage).
 *
 * The app calls paid services from about twenty-five places. On 2026-11-20
 * eighteen of them recorded nothing about what they spent, so the cap,
 * which is counted from what is recorded, saw part of the bill. Rather
 * than teach each place to count, one meter stands where every outbound
 * call passes (lib/system/aiMeter.ts). These are its rules, kept pure so
 * they can be tested without a network.
 *
 * Prices are list prices in USD, entered 2026-11-20:
 *   Claude: per million tokens, in lib/ai/usage.ts (Sonnet 3/15, Haiku 1/5, Opus 15/75).
 *     A cache write is billed at 1.25× input and a cache read at 0.1×.
 *   OpenAI: whisper-1 $0.006 a minute; tts-1 $15 per million characters;
 *     text-embedding-3-small $0.02 per million tokens.
 * A model with no price here is costed as the dearest known for its kind,
 * so an unknown is never under-counted.
 */
import { costPence } from "./usage";

export type MeteredCall = { provider: "anthropic" | "openai" | "elevenlabs"; endpoint: string };

/** Sent by a call site that records its own spend (with its own tag); the meter then gates but does not count it twice. */
export const RECORDED_HEADER = "x-mycelium-recorded";

/** Which paid service a URL is, or null for everything else. */
export function meteredCall(url: string): MeteredCall | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const path = u.pathname.replace(/\/+$/, "");
  if (u.hostname === "api.anthropic.com") return path.startsWith("/v1/messages") ? { provider: "anthropic", endpoint: "messages" } : null;
  if (u.hostname === "api.openai.com") {
    if (path.endsWith("/chat/completions")) return { provider: "openai", endpoint: "chat" };
    if (path.endsWith("/embeddings")) return { provider: "openai", endpoint: "embeddings" };
    if (path.endsWith("/audio/transcriptions")) return { provider: "openai", endpoint: "transcriptions" };
    if (path.endsWith("/audio/speech")) return { provider: "openai", endpoint: "speech" };
    return null;
  }
  if (u.hostname === "api.elevenlabs.io") return path.includes("/text-to-speech") ? { provider: "elevenlabs", endpoint: "speech" } : null;
  return null;
}

export type Usage = {
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_pence: number;
  /** True when the cost is worked out from the size of the request, not reported by the provider. */
  estimated: boolean;
  meta: Record<string, unknown>;
};

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const USD = { whisperPerMinute: 0.006, ttsPerChar: 15 / 1_000_000, embedPerToken: 0.02 / 1_000_000 };
/** Bytes of compressed speech in a minute at 32 kbit/s: a low figure, so a recording's length is over-estimated rather than under. */
const BYTES_PER_MINUTE = (32_000 / 8) * 60;

type AnthropicUsage = { input_tokens?: unknown; output_tokens?: unknown; cache_creation_input_tokens?: unknown; cache_read_input_tokens?: unknown };

function anthropicCost(model: string | null, u: AnthropicUsage): Usage {
  const input = n(u.input_tokens);
  const output = n(u.output_tokens);
  const written = n(u.cache_creation_input_tokens);
  const read = n(u.cache_read_input_tokens);
  // Cache tokens are billed at a multiple of the input price: fold them into "input tokens at the input price".
  const billedInput = input + written * 1.25 + read * 0.1;
  return {
    model,
    input_tokens: input + written + read,
    output_tokens: output,
    cost_pence: costPence(model, billedInput, output),
    estimated: false,
    meta: written || read ? { cache_written: written, cache_read: read } : {},
  };
}

/**
 * The usage in a finished JSON response.
 * `request` carries what only the request knows: the model asked for, the
 * characters sent to be spoken, the bytes of audio sent to be transcribed.
 */
export function usageFromJson(call: MeteredCall, body: unknown, request: { model?: string | null; chars?: number; audioBytes?: number } = {}): Usage | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const model = (typeof b.model === "string" ? b.model : null) ?? request.model ?? null;
  if (call.provider === "anthropic") {
    if (!b.usage || typeof b.usage !== "object") return null;
    return anthropicCost(model, b.usage as AnthropicUsage);
  }
  if (call.provider === "openai" && call.endpoint === "chat") {
    const u = (b.usage ?? {}) as { prompt_tokens?: unknown; completion_tokens?: unknown };
    if (!b.usage) return null;
    // No OpenAI chat model is priced here: costed at the fallback (Sonnet) rate, which is above every small OpenAI model.
    return { model, input_tokens: n(u.prompt_tokens), output_tokens: n(u.completion_tokens), cost_pence: costPence(null, n(u.prompt_tokens), n(u.completion_tokens)), estimated: false, meta: { priced_as: "fallback" } };
  }
  if (call.provider === "openai" && call.endpoint === "embeddings") {
    const u = (b.usage ?? {}) as { total_tokens?: unknown; prompt_tokens?: unknown };
    const tokens = n(u.total_tokens) || n(u.prompt_tokens);
    return { model, input_tokens: tokens, output_tokens: 0, cost_pence: costPence(null, 0, 0, tokens * USD.embedPerToken), estimated: false, meta: {} };
  }
  if (call.provider === "openai" && call.endpoint === "transcriptions") {
    // The provider says how long the audio was only in its verbose reply; otherwise the length is taken from the size sent.
    const seconds = n(b.duration);
    const minutes = seconds ? seconds / 60 : n(request.audioBytes) / BYTES_PER_MINUTE;
    if (!minutes) return null;
    return { model, input_tokens: 0, output_tokens: 0, cost_pence: costPence(null, 0, 0, minutes * USD.whisperPerMinute), estimated: !seconds, meta: { minutes: Math.round(minutes * 100) / 100 } };
  }
  return null;
}

/** Speech is priced by what was sent, and its reply is audio, not JSON. */
export function usageFromSpeech(call: MeteredCall, request: { model?: string | null; chars?: number }): Usage | null {
  const chars = n(request.chars);
  if (!chars) return null;
  if (call.provider === "openai") return { model: request.model ?? null, input_tokens: 0, output_tokens: 0, cost_pence: costPence(null, 0, 0, chars * USD.ttsPerChar), estimated: false, meta: { chars } };
  // ElevenLabs is a subscription with a monthly allowance, not pay-as-you-go: counted in characters, not in pence.
  return { model: request.model ?? null, input_tokens: 0, output_tokens: 0, cost_pence: 0, estimated: false, meta: { chars, subscription: true } };
}

/**
 * The usage in a finished Claude event stream. Input tokens arrive in
 * `message_start`, the running output total in each `message_delta`; the
 * last one is the answer.
 */
export function usageFromAnthropicStream(text: string): Usage | null {
  let model: string | null = null;
  let seen = false;
  const total: AnthropicUsage = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    let ev: { type?: string; message?: { model?: string; usage?: AnthropicUsage }; usage?: AnthropicUsage };
    try {
      ev = JSON.parse(raw);
    } catch {
      continue;
    }
    const u = ev.type === "message_start" ? ev.message?.usage : ev.type === "message_delta" ? ev.usage : undefined;
    if (ev.type === "message_start" && typeof ev.message?.model === "string") model = ev.message.model;
    if (!u) continue;
    seen = true;
    // Each field is a running total, not an increment: keep the latest value of each.
    for (const k of ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"] as const) {
      if (typeof u[k] === "number") total[k] = u[k];
    }
  }
  return seen ? anthropicCost(model, total) : null;
}

/** What the request body says about itself, read without consuming it. */
export function requestFacts(body: unknown): { model?: string | null; chars?: number; audioBytes?: number; stream?: boolean } {
  if (typeof body === "string") {
    try {
      const j = JSON.parse(body) as { model?: unknown; input?: unknown; text?: unknown; stream?: unknown; model_id?: unknown };
      const spoken = typeof j.input === "string" ? j.input : typeof j.text === "string" ? j.text : null;
      return {
        model: typeof j.model === "string" ? j.model : typeof j.model_id === "string" ? j.model_id : null,
        chars: spoken ? spoken.length : undefined,
        stream: j.stream === true,
      };
    } catch {
      return {};
    }
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    let audioBytes = 0;
    let model: string | null = null;
    for (const [key, value] of body.entries()) {
      if (typeof value === "string") {
        if (key === "model") model = value;
      } else if (typeof (value as Blob).size === "number") {
        audioBytes += (value as Blob).size;
      }
    }
    return { model, audioBytes };
  }
  return {};
}

export type CapState = { spent_pence: number; cap_pence: number };

/** Over the cap: the call is not made. */
export const overCap = (s: CapState): boolean => s.cap_pence >= 0 && s.spent_pence >= s.cap_pence;

/** Which alert thresholds (80% and 100%) the spend has reached. */
export function thresholdsReached(s: CapState): number[] {
  if (s.cap_pence <= 0) return [];
  return [80, 100].filter((t) => s.spent_pence >= (s.cap_pence * t) / 100);
}

/** The body the caller receives in place of the provider's when the cap is spent: shaped like a provider error, so existing error handling takes it. */
export function capRefusalBody(s: CapState): string {
  const pounds = (p: number) => `£${(p / 100).toFixed(2)}`;
  return JSON.stringify({
    type: "error",
    error: { type: "cloud_cap_reached", message: `This month's cloud AI cap is spent (${pounds(s.spent_pence)} of ${pounds(s.cap_pence)}). Nothing was sent. It resets on the 1st.` },
  });
}
