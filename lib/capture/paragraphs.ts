/**
 * Paragraph breaks for long captures (master run §5, "Paragraphs").
 *
 * Dictation arrives as one unbroken block. This puts blank lines where the
 * speaker moved on, so the stored text and the review card can be read. It
 * never changes a word: the only characters added or removed are spaces and
 * line breaks, which `sameWording()` checks and the tests enforce.
 *
 * No model involved. A break is placed
 *   - before a sentence that opens with a change-of-subject phrase
 *     ("Also", "Another thing", "Next", "Oh and", …), and
 *   - when a paragraph has run long enough (three sentences and forty
 *     words, or seventy words whatever the sentence count).
 * Text that already has line breaks is the writer's own layout and is only
 * tidied. Short captures are returned as they came.
 */

/** Below this many words a capture is one thought; leave it alone. */
export const MIN_WORDS_TO_BREAK = 45;
const SOFT_SENTENCES = 3;
const SOFT_WORDS = 40;
const HARD_WORDS = 70;

/** Openers that mark a new subject. Matched at the start of a sentence, case-insensitive. */
const SHIFT_OPENERS = [
  "also",
  "another thing",
  "and another thing",
  "the other thing",
  "other thing",
  "next",
  "next thing",
  "oh and",
  "oh, and",
  "separately",
  "on another note",
  "on a different note",
  "anyway",
  "right so",
  "right, so",
  "ok so",
  "okay so",
  "ok, so",
  "okay, so",
  "secondly",
  "thirdly",
  "second thing",
  "third thing",
  "finally",
  "lastly",
  "last thing",
  "one more thing",
  "then there's",
  "then there is",
  "moving on",
  "new thing",
  "new idea",
  "idea",
  "reminder",
  "note to self",
];

const OPENER_RE = new RegExp(`^(?:${SHIFT_OPENERS.map((o) => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|")})(?=[\\s,:;.!?—-]|$)`, "i");

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** True when two texts differ only in spaces and line breaks. */
export function sameWording(a: string, b: string): boolean {
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

/**
 * Sentences, each keeping its closing punctuation. A full stop ends a
 * sentence only when followed by space and a capital, a digit or an opening
 * quote, so "3.5 kg", "e.g. this" and "Dr. Smith said" stay whole more
 * often than not; a wrong guess costs a paragraph break, never a word.
 */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  const out: string[] = [];
  let start = 0;
  const re = /[.!?…]+["'”’)]*\s+(?=["'“‘(]?[A-Z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) !== null) {
    const end = m.index + m[0].length;
    const candidate = flat.slice(start, end).trim();
    // "Dr. Smith", "Mr. Jones", "St. Albans": a short title before the stop is not an ending.
    if (/(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|Prof|No|vs|etc|e\.g|i\.e)\.$/i.test(candidate)) continue;
    out.push(candidate);
    start = end;
  }
  const tail = flat.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Tidy a text that already has line breaks: trim line ends, at most one blank line in a row. */
function tidyExisting(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatParagraphs(input: string): string {
  const text = input ?? "";
  if (!text.trim()) return "";
  if (/\n/.test(text.trim())) return tidyExisting(text);

  const flat = text.replace(/[ \t]+/g, " ").trim();
  if (wordCount(flat) < MIN_WORDS_TO_BREAK) return flat;

  const sentences = splitSentences(flat);
  if (sentences.length < 2) return flat;

  const paragraphs: string[][] = [[]];
  let words = 0;
  for (const sentence of sentences) {
    const current = paragraphs[paragraphs.length - 1];
    const n = wordCount(sentence);
    const shift = current.length > 0 && OPENER_RE.test(sentence);
    const softFull = current.length >= SOFT_SENTENCES && words >= SOFT_WORDS;
    const hardFull = current.length > 0 && words + n > HARD_WORDS;
    if (shift || softFull || hardFull) {
      paragraphs.push([sentence]);
      words = n;
    } else {
      current.push(sentence);
      words += n;
    }
  }

  // A one-sentence orphan at the end reads worse than a slightly long paragraph.
  if (paragraphs.length > 1) {
    const last = paragraphs[paragraphs.length - 1];
    const prev = paragraphs[paragraphs.length - 2];
    if (last.length === 1 && wordCount(last[0]) < 8 && !OPENER_RE.test(last[0])) {
      prev.push(last[0]);
      paragraphs.pop();
    }
  }

  const result = paragraphs.map((p) => p.join(" ")).join("\n\n");
  // Belt and braces: if anything but whitespace changed, give the text back untouched.
  return sameWording(result, text) ? result : flat;
}
