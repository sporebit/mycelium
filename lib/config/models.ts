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
