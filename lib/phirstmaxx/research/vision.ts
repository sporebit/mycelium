/**
 * PhirstMaxx research — reading a photo or screenshot with a vision model
 * (spec §6 step 1: "a vision model for signage, landmark and scene").
 *
 * One Messages API call with the image as a base64 content block, asking
 * for a small JSON object: the place's name if it can be read or recognised,
 * the town, any signage text, what the scene is, and how sure the model is.
 * The model is the one ANTHROPIC_MODEL names (lib/config/models.ts,
 * MODEL_VISION), the same raw-fetch shape as lib/ai/anthropic.ts, with the
 * feature header so the meter files the cost; the cost is also returned so
 * the pipeline can write it on the research run and in api_usage.
 *
 * Paid: the pipeline gates every call on the research spend rule (spec
 * §11.5) before coming here. No key, or any failure, is null, never a throw.
 */
import { costPence } from "@/lib/ai/usage";
import { FEATURE_HEADER, RECORDED_HEADER } from "@/lib/ai/meterRules";
import { MODEL_VISION } from "@/lib/config/models";

export const VISION_TAG = "phirstmaxx.research.vision";

export type VisionRead = {
  place_name: string | null;
  town: string | null;
  signage_text: string | null;
  scene: string | null;
  /** 0–1 */
  confidence: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_pence: number;
};

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** The media type the API accepts for these bytes, from the magic numbers; null for anything else (HEIC, PDF…). */
export function sniffImageType(bytes: Uint8Array): ImageMediaType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

export const VISION_SYSTEM = [
  "You read one photo or screenshot someone shared because they want to visit the place in it. British English.",
  "Work out, if you can, which real place it shows: a sign, a landmark, a caption in a screenshot, a shop front, a known view.",
  "Respond with ONLY a JSON object: {\"place_name\": string|null, \"town\": string|null, \"signage_text\": string|null, \"scene\": string, \"confidence\": number}.",
  "place_name is the proper name of the place or null when you cannot tell; never guess a name from a generic scene.",
  "town is the town or area if the picture or its text says so. signage_text is any text you can read, verbatim. scene is one short sentence (\"a woodland path with a waterfall\").",
  "confidence is 0 to 1 for the place_name: 0.9 or more only when the name is written in the picture.",
].join("\n");

const str = (v: unknown, max = 300): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The model's text → the shape, or null when it is not the shape asked for. Exported for tests. */
export function parseVision(text: string): Omit<VisionRead, "model" | "input_tokens" | "output_tokens" | "cost_pence"> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? Math.max(0, Math.min(1, o.confidence)) : 0;
    return { place_name: str(o.place_name, 200), town: str(o.town, 120), signage_text: str(o.signage_text, 1000), scene: str(o.scene, 400), confidence };
  } catch {
    return null;
  }
}

export type VisionInput = { bytes: Uint8Array; media_type?: ImageMediaType | null; /** The caption or shared text that came with it. */ hint?: string | null };

/** Base64 without a dependency; chunked so very large pictures do not blow the stack. */
export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function readImage(input: VisionInput, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<VisionRead | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const mediaType = input.media_type ?? sniffImageType(input.bytes);
  if (!mediaType) return null;
  // the API's limit is 5 MB per image; the share sheet sends a lot more than that for a photo
  if (input.bytes.byteLength > 4_800_000) return null;
  const model = MODEL_VISION;
  const f = opts.fetch ?? globalThis.fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
  try {
    const res = await f("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", [FEATURE_HEADER]: VISION_TAG, [RECORDED_HEADER]: "1" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: VISION_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: toBase64(input.bytes) } },
              { type: "text", text: input.hint ? `Shared with this text: ${input.hint.slice(0, 1500)}\n\nWhich place is this?` : "Which place is this?" },
            ],
          },
        ],
      }),
    });
    const j = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
    if (!res.ok) throw new Error(j.error?.message ?? `anthropic ${res.status}`);
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    const parsed = parseVision(text);
    if (!parsed) return null;
    const input_tokens = j.usage?.input_tokens ?? 0;
    const output_tokens = j.usage?.output_tokens ?? 0;
    return { ...parsed, model, input_tokens, output_tokens, cost_pence: costPence(model, input_tokens, output_tokens) };
  } catch (err) {
    console.error("[phirstmaxx/vision] failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
