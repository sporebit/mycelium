/**
 * Day log — the score line (spec decision 14a, §4.3 rule 7). Pure.
 * "4 3 5 2", "4,3,5,2", "four three five two", "mood 4 energy 3" are all
 * parsed by the engine, never by the model. A partial reply keeps what it
 * got and names the missing keys so the transport can ask for them.
 */

export const DEFAULT_SCORE_KEYS = ["mood", "energy", "sleep", "productivity"] as const;

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

export type ScoreParse = {
  scores: Record<string, number>;
  missing: string[];
  /** true when at least one token was understood as a score */
  any: boolean;
  /** tokens that looked like scores but were out of range (6, 0, 10…) */
  rejected: string[];
};

/** Parse a reply against the configured keys, in order. Existing scores are kept for keys not in the reply. */
export function parseScoreLine(reply: string, keys: readonly string[], existing: Record<string, number> = {}): ScoreParse {
  const scores: Record<string, number> = { ...existing };
  const rejected: string[] = [];
  const text = reply.toLowerCase().replace(/[,;/|]+/g, " ").replace(/\s+/g, " ").trim();
  let any = false;

  // 1. "key value" pairs anywhere ("mood 4, sleep five")
  const keyed = new Set<string>();
  for (const k of keys) {
    const m = text.match(new RegExp(`\\b${k}\\b\\s*[:=-]?\\s*([0-9]+|one|two|three|four|five)\\b`));
    if (m) {
      const v = WORDS[m[1]] ?? Number(m[1]);
      if (v >= 1 && v <= 5) {
        scores[k] = v;
        keyed.add(k);
        any = true;
      } else rejected.push(m[0]);
    }
  }
  if (keyed.size === 0) {
    // 2. bare digits / words in key order ("4 3 5 2", "four three")
    const tokens = text.split(" ").filter((t) => /^[0-9]+$/.test(t) || t in WORDS);
    const remaining = keys.filter((k) => !(k in scores) || existing[k] === undefined);
    const targets = remaining.length ? remaining : [...keys];
    tokens.slice(0, targets.length).forEach((t, i) => {
      const v = WORDS[t] ?? Number(t);
      if (v >= 1 && v <= 5) {
        scores[targets[i]] = v;
        any = true;
      } else rejected.push(t);
    });
  }
  const missing = keys.filter((k) => !(k in scores));
  return { scores, missing, any, rejected };
}

export function scoreLinePrompt(keys: readonly string[]): string {
  return `${keys.join(" / ")}, 1–5?`;
}

/** The reply carries digits only when every key is present. */
export function formatScores(scores: Record<string, number>, keys: readonly string[]): string {
  return keys.map((k) => `${k} ${scores[k] ?? "–"}`).join(" · ");
}
