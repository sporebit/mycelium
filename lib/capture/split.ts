/**
 * Splitting a long capture into separate items (master run §5: "Long
 * captures are split into separate items, each its own card linked to the
 * original recording").
 *
 * A brain dump usually holds several unrelated things. Each becomes its own
 * review card. Two rules keep this safe:
 *
 *   - **Wording is never changed.** A model is only ever asked which
 *     sentences belong together, as sentence numbers; the text of each item
 *     is cut from the original by those numbers. A reply that does not
 *     cover every sentence exactly once, in order, is thrown away.
 *   - **When in doubt, do not split.** One long reflective entry is one
 *     item. Without a model, a split happens only where the speaker said so
 *     ("Also…", "Another thing…", "Oh and…").
 *
 * Research rule 19: items split from a dump land as ideas, never as
 * commitments. That is the caller's job (lib/capture/pipeline.ts); this
 * file only decides where the cuts go.
 */
import { splitSentences, wordCount } from "./paragraphs";

/** Below this, a capture is one item whatever it says. */
export const MIN_WORDS_TO_SPLIT = 30;
export const MIN_SENTENCES_TO_SPLIT = 2;
/** More cards than this from one recording is noise; fall back to fewer, larger items. */
export const MAX_ITEMS = 8;

const SHIFT_RE =
  /^(?:also|another thing|and another thing|the other thing|other thing|next thing|next|oh,? and|separately|on another note|on a different note|secondly|thirdly|second thing|third thing|finally|lastly|last thing|one more thing|then there(?:'s| is)|moving on|new thing|new idea|reminder|note to self)(?=[\s,:;.!?—-]|$)/i;

export type Segment = { text: string; from: number; to: number };

export function shouldConsiderSplit(text: string): boolean {
  return wordCount(text) >= MIN_WORDS_TO_SPLIT && splitSentences(text).length >= MIN_SENTENCES_TO_SPLIT;
}

function build(sentences: string[], ranges: Array<[number, number]>): Segment[] {
  return ranges.map(([from, to]) => ({ from, to, text: sentences.slice(from, to + 1).join(" ") }));
}

/** Cuts only where the speaker announced a new subject. */
export function heuristicSegments(text: string): Segment[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  const ranges: Array<[number, number]> = [];
  let start = 0;
  for (let i = 1; i < sentences.length; i++) {
    if (SHIFT_RE.test(sentences[i])) {
      ranges.push([start, i - 1]);
      start = i;
    }
  }
  ranges.push([start, sentences.length - 1]);
  if (ranges.length > MAX_ITEMS) return build(sentences, [[0, sentences.length - 1]]);
  return build(sentences, ranges);
}

export const SEGMENT_SYSTEM_PROMPT = [
  "You sort a dictated note into the separate items it contains.",
  "The note is given as numbered sentences. Group CONSECUTIVE sentences that belong to the same item.",
  "An item is one task, one idea, one reminder, one thing to buy, one fact to log, or one piece of reflection.",
  "Sentences that give detail, reasons or context for an item stay with that item.",
  "A reflective or diary-style passage about one's day or feelings is ONE item, however long.",
  "If the whole note is about one thing, return one group covering every sentence.",
  "Never reorder, skip, repeat or rewrite sentences. Every sentence number must appear in exactly one group.",
  'Reply with JSON only, in this shape: {"items":[[1,2],[3,3],[4,6]]} where each pair is [first sentence, last sentence].',
].join("\n");

export function segmentUserPrompt(sentences: string[]): string {
  return sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

/**
 * Turn a model's reply into ranges, or null if it cannot be trusted:
 * the ranges must start at 1, be contiguous, in order, and end at `count`.
 */
export function parseSegmentReply(reply: string | null | undefined, count: number): Array<[number, number]> | null {
  if (!reply) return null;
  let parsed: unknown;
  try {
    const start = reply.indexOf("{");
    const end = reply.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? reply.slice(start, end + 1) : reply);
  } catch {
    return null;
  }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null;
  const ranges: Array<[number, number]> = [];
  let expected = 1;
  for (const item of items) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [a, b] = item as [unknown, unknown];
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    const from = a as number;
    const to = b as number;
    if (from !== expected || to < from || to > count) return null;
    ranges.push([from - 1, to - 1]);
    expected = to + 1;
  }
  if (expected !== count + 1) return null;
  return ranges;
}

/** Asks a model one question and returns its text, or null if no model answered. */
export type AskModel = (system: string, user: string) => Promise<string | null>;

export type SplitResult = { segments: Segment[]; by: "none" | "model" | "heuristic" };

/**
 * The items in a capture. One segment means "do not split".
 * `ask` is optional: without it, or when its reply cannot be trusted, the
 * announced-subject heuristic decides.
 */
export async function splitCapture(text: string, ask?: AskModel): Promise<SplitResult> {
  const whole = (): SplitResult => {
    const s = splitSentences(text);
    return { segments: [{ text: s.join(" ") || text.trim(), from: 0, to: Math.max(0, s.length - 1) }], by: "none" };
  };
  if (!shouldConsiderSplit(text)) return whole();
  const sentences = splitSentences(text);

  if (ask) {
    try {
      const ranges = parseSegmentReply(await ask(SEGMENT_SYSTEM_PROMPT, segmentUserPrompt(sentences)), sentences.length);
      if (ranges) {
        const segments = build(sentences, ranges);
        return segments.length > 1 ? { segments, by: "model" } : { segments, by: "none" };
      }
    } catch (err) {
      console.error("[capture/split] model split failed, using the heuristic:", err);
    }
  }

  const segments = heuristicSegments(text);
  return segments.length > 1 ? { segments, by: "heuristic" } : whole();
}
