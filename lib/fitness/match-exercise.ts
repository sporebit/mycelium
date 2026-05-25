import type { MatchConfidence } from "./types";

/**
 * Common abbreviations used when describing exercises by voice. The values are
 * candidate phrases the abbreviation might stand for; matching expands the
 * voice term and re-runs comparison against each.
 */
const ABBREVIATIONS: Record<string, string[]> = {
  BB: ["barbell"],
  DB: ["dumbbell"],
  KB: ["kettlebell"],
  OHP: ["overhead press", "shoulder press", "military press"],
  RDL: ["romanian deadlift"],
  BSS: ["bulgarian split squat"],
  EMOM: ["every minute on the minute"],
  HIIT: ["high intensity interval"],
  PR: ["personal record"],
  PB: ["personal best"],
  PPL: ["push pull legs"],
};

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "of",
  "to",
  "with",
  "on",
  "for",
  "in",
  "at",
  "set",
  "sets",
  "rep",
  "reps",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/[\s/-]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Expand any abbreviations in the voice term into one or more candidate strings. */
function expandAbbreviations(voiceTerm: string): string[] {
  const upper = voiceTerm.toUpperCase();
  const variants = new Set<string>([voiceTerm.toLowerCase()]);
  for (const [abbr, expansions] of Object.entries(ABBREVIATIONS)) {
    // Match abbreviation as a whole token only
    const wordRe = new RegExp(`\\b${abbr}\\b`, "g");
    if (wordRe.test(upper)) {
      for (const exp of expansions) {
        variants.add(
          voiceTerm.toLowerCase().replace(new RegExp(`\\b${abbr}\\b`, "gi"), exp)
        );
      }
    }
  }
  return Array.from(variants);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Find the best candidate name for a voice-spoken term.
 *
 * Strategy (returns the first confident match):
 *   1. Exact case-insensitive match → high
 *   2. Word-boundary substring (one contains the other) → high
 *   3. Abbreviation-expanded exact/substring match → high
 *   4. Partial substring (anywhere) → medium
 *   5. Token-set Jaccard ≥ 0.5 → medium
 *   6. Otherwise null.
 *
 * Designed to be deterministic and side-effect-free; safe to call from
 * any context including inside an LLM pre-processing step.
 */
export function matchExerciseName(
  voiceTerm: string,
  candidates: string[]
): { name: string; confidence: MatchConfidence } | null {
  const v = voiceTerm.trim();
  if (!v || candidates.length === 0) return null;

  const vLower = v.toLowerCase();
  const expanded = expandAbbreviations(v);

  // Pass 1: exact / word-boundary / abbreviation matches
  for (const c of candidates) {
    const cLower = c.toLowerCase();
    if (cLower === vLower) return { name: c, confidence: "high" };
    // Word-boundary substring (uses Unicode-aware split → cheap heuristic)
    const cTokens = tokens(c);
    const vTokens = tokens(v);
    if (
      cTokens.every((t) => vTokens.includes(t)) ||
      vTokens.every((t) => cTokens.includes(t))
    ) {
      return { name: c, confidence: "high" };
    }
    // Abbreviation pass — any expansion's tokens fully covered by candidate
    for (const exp of expanded) {
      if (exp === vLower) continue;
      const expTokens = tokens(exp);
      if (
        expTokens.length > 0 &&
        (expTokens.every((t) => cTokens.includes(t)) ||
          cTokens.every((t) => expTokens.includes(t)))
      ) {
        return { name: c, confidence: "high" };
      }
    }
  }

  // Pass 2: medium-confidence — partial substring
  for (const c of candidates) {
    const cLower = c.toLowerCase();
    if (cLower.includes(vLower) || vLower.includes(cLower)) {
      return { name: c, confidence: "medium" };
    }
  }

  // Pass 3: token Jaccard — pick the highest, must clear 0.5
  let best: { name: string; score: number } | null = null;
  const vTokens = tokens(v);
  for (const c of candidates) {
    const score = jaccard(vTokens, tokens(c));
    if (!best || score > best.score) best = { name: c, score };
  }
  if (best && best.score >= 0.5) {
    return { name: best.name, confidence: "medium" };
  }
  if (best && best.score >= 0.3) {
    return { name: best.name, confidence: "low" };
  }

  return null;
}
