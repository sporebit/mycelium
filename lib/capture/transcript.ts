/**
 * Two transcripts of the same recording: the phone's instant one and
 * Whisper's later one (master run §5, "Transcription"). The stored text is
 * corrected only when they really differ, and never when the person edited
 * the text by hand: their edit wins.
 *
 * Pure. "Really differ" means the words differ, not the punctuation or the
 * capitals: dictation and Whisper punctuate differently on identical speech.
 */

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word-level edit distance (insert, delete, replace), capped so a long capture stays cheap. */
export function wordDistance(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** The share of words that differ, 0 to 1. */
export function difference(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  const longest = Math.max(wa.length, wb.length);
  if (longest === 0) return 0;
  // Very long texts: compare the first 400 words; a real difference shows there.
  return wordDistance(wa.slice(0, 400), wb.slice(0, 400)) / Math.min(longest, 400);
}

export type Correction =
  | { use: "whisper"; reason: "no_text" | "differs" }
  | { use: "keep"; reason: "edited_by_hand" | "same_words" | "whisper_empty" };

/**
 * Which text stands. `stored` is what the capture holds now (dictation, or
 * nothing when only audio arrived); `whisper` is the new transcript.
 */
export function chooseText(input: { stored: string | null | undefined; whisper: string | null | undefined; editedByHand: boolean }): Correction {
  const whisper = (input.whisper ?? "").trim();
  const stored = (input.stored ?? "").trim();
  if (!whisper) return { use: "keep", reason: "whisper_empty" };
  if (!stored) return { use: "whisper", reason: "no_text" };
  if (input.editedByHand) return { use: "keep", reason: "edited_by_hand" };
  // One word in twenty-five, or any difference at all in a short capture.
  const diff = difference(stored, whisper);
  const threshold = words(stored).length <= 12 ? 0 : 0.04;
  return diff > threshold ? { use: "whisper", reason: "differs" } : { use: "keep", reason: "same_words" };
}
