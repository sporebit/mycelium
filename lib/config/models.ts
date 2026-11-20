/**
 * Every Anthropic model id in one place.
 *
 * Model strings were previously scattered as literals across a dozen route
 * files, several of them stale (`claude-sonnet-4-20250514`) or pinned to a
 * dated snapshot (`claude-haiku-4-5-20251001`). Import from here instead.
 */

/** Conversational + reasoning work: agents, briefings, Ask, smart views. */
export const MODEL_CHAT = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

/**
 * Cheap, high-volume structured work — classification and field extraction,
 * where the task is "read this and emit JSON in a fixed shape" rather than
 * anything requiring judgement.
 */
export const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5";

/**
 * Photo parsing (recipes, blood tests, eye prescriptions, nutrition labels).
 * Deliberately NOT routed to MODEL_FAST: these read cramped, low-contrast
 * documents where a misread number is a silent data error, so they stay on
 * the stronger model.
 */
export const MODEL_VISION =
  process.env.ANTHROPIC_VISION_MODEL ??
  process.env.ANTHROPIC_MODEL ??
  "claude-sonnet-4-5";

export type Provider = "anthropic" | "openai";

/**
 * Models with a price on file (MYC-190): the only ones Settings offers.
 * A model the providers list but that is not here is shown, not
 * selectable; a model here that a provider has retired is still shown, with
 * the retirement. List prices in USD per million tokens [input, output],
 * as published on 2026-11-20; lib/ai/usage.ts keeps its own family table
 * for costing calls. Nothing switches a model on its own: add a row here
 * and choose it in Settings.
 */
export const PRICED: ReadonlyArray<{ id: string; label: string; provider: Provider; usdPerMTok: [number, number] }> = [
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic", usdPerMTok: [3, 15] },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", usdPerMTok: [1, 5] },
  { id: "claude-opus-4-1", label: "Claude Opus 4.1", provider: "anthropic", usdPerMTok: [15, 75] },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "openai", usdPerMTok: [0.15, 0.6] },
];

export function isPriced(modelId: string): boolean {
  return PRICED.some((m) => m.id === modelId);
}

/** The models the code is pinned to right now: the three roles above and the capture classifier. */
export function pinnedByEnv(): Array<{ role: string; model: string }> {
  const out = [
    { role: "chat", model: MODEL_CHAT },
    { role: "fast", model: MODEL_FAST },
    { role: "vision", model: MODEL_VISION },
  ];
  const classifier = process.env.OPENAI_CLASSIFIER_MODEL;
  if (classifier) out.push({ role: "capture classifier", model: classifier });
  return out;
}
