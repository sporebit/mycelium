import { normaliseAlias } from "./normalise";

export interface RegexExtraction {
  /** Exact matched substring from the source text. */
  raw: string;
  /** Title-cased normalised form used for resolution. */
  name_hint: string;
}

/**
 * Words that look name-shaped (capitalised) but never are. Lowercase set —
 * lookups use the lowercased candidate. Inline because it lives near the
 * regex that uses it, and adding entries is just a one-line edit.
 */
const EXCLUSIONS = new Set<string>([
  // days
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "mon",
  "tue",
  "tues",
  "wed",
  "thu",
  "thur",
  "thurs",
  "fri",
  "sat",
  "sun",

  // months
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",

  // capitalised task verbs / common starts
  "buy",
  "call",
  "phone",
  "email",
  "send",
  "check",
  "get",
  "make",
  "book",
  "schedule",
  "pick",
  "drop",
  "finish",
  "start",
  "update",
  "review",
  "plan",
  "order",
  "do",
  "go",
  "fix",
  "write",
  "read",
  "ask",
  "tell",
  "remind",
  "reply",
  "find",
  "look",
  "watch",
  "follow",
  "research",
  "renew",
  "cancel",
  "pay",
  "transfer",

  // pronouns / common starts
  "i",
  "he",
  "she",
  "they",
  "we",
  "you",
  "it",

  // common nouns capitalised at sentence start
  "today",
  "tomorrow",
  "tonight",
  "yesterday",
  "morning",
  "afternoon",
  "evening",
  "night",
  "week",
  "weekend",
  "month",
  "year",
  "weeks",
  "months",
  "years",

  // articles + connectives that occasionally start sentences
  "the",
  "a",
  "an",
  "and",
  "but",
  "or",
  "so",
  "if",
  "when",
  "while",
  "before",
  "after",
  "during",
  "since",
]);

/** All-caps acronym pattern — skip these. */
const ACRONYM = /^[A-Z]{2,5}$/;

/** Sentence-start detection: index 0, or preceded by `. `, `? `, `! `, or newline. */
function isSentenceStart(text: string, index: number): boolean {
  if (index === 0) return true;
  // Look back past whitespace
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i < 0) return true;
  const ch = text[i];
  return ch === "." || ch === "!" || ch === "?" || ch === "\n";
}

/**
 * Extract candidate person mentions from arbitrary text.
 *
 * Algorithm:
 *  1. Match 1–3 consecutive title-cased word tokens (each 2–16 chars).
 *  2. Reject any tokens that are all-caps acronyms.
 *  3. Reject when the *first* token is on the exclusion list AND the match
 *     is at a sentence boundary (so "Today I will call Luke" doesn't extract
 *     "Today I", but "Luke" stays). For mid-sentence matches, if the first
 *     token is excluded the whole match is skipped because the rest is
 *     usually noise ("the Apple Store" → first token "Apple" passes; "Tomorrow
 *     morning" → "Tomorrow" excluded, skipped).
 *  4. Dedupe by case-insensitive `name_hint`.
 */
export function extractNameMentions(text: string): RegexExtraction[] {
  if (!text) return [];
  const re = /\b[A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15}){0,2}\b/g;
  const out: RegexExtraction[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const matched = m[0];
    const startIdx = m.index;
    const tokens = matched.split(/\s+/);
    // Skip if any token is an all-caps acronym (shouldn't pre-match anyway,
    // but defensive against unicode oddities)
    if (tokens.some((t) => ACRONYM.test(t))) continue;
    const firstLower = tokens[0].toLowerCase();
    if (EXCLUSIONS.has(firstLower)) {
      // At sentence start an excluded leading word is expected (e.g. "Today")
      // — try the remainder of the match as a fresh candidate.
      if (tokens.length === 1) continue;
      const rest = tokens.slice(1).join(" ");
      const restLower = rest.split(" ")[0]?.toLowerCase();
      if (!restLower || EXCLUSIONS.has(restLower)) continue;
      const normalised = normaliseAlias(rest);
      const key = normalised.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ raw: rest, name_hint: normalised });
      }
      continue;
    }
    // Sentence-start single-word that's a borderline case: still emit
    // (the LLM-driven resolver decides whether it matches an existing person).
    if (
      isSentenceStart(text, startIdx) &&
      tokens.length === 1 &&
      EXCLUSIONS.has(firstLower)
    ) {
      continue;
    }
    const normalised = normaliseAlias(matched);
    const key = normalised.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ raw: matched, name_hint: normalised });
  }
  return out;
}
