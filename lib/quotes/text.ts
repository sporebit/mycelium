/**
 * Quotes — pure text helpers (spec §4, §9): trigram similarity for the
 * near-duplicate warning, relative `said_at` parsing, and the speaker rules
 * applied on top of the classifier's extraction. Isomorphic, no I/O.
 */

export type QuoteExtraction = {
  text: string;
  speaker: string | null;
  is_own: boolean;
  speaker_confidence: "certain" | "uncertain";
  context: string | null;
  said_at_relative: string | null;
  source: string | null;
  likely_original: boolean;
};

function trigrams(s: string): Set<string> {
  const t = `  ${s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** pg_trgm-style similarity in [0, 1]. */
export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export const DUPLICATE_THRESHOLD = 0.6;

/**
 * Speaker rules (spec §4.3): "X told me / X said / X's quote" → X;
 * "I said / I've just said / my quote" → own; addressee-only ("Jake, your
 * dog is crazy") → own + uncertain; no attribution → own + uncertain.
 * Applied after the model so a casual phrasing still lands consistently.
 */
export function applySpeakerRules(raw: string, ex: QuoteExtraction): QuoteExtraction {
  const r = raw.toLowerCase();
  const own = /\b(i said|i've just said|i just said|my quote|i said a quote|i've got a quote|here's my quote|quote of mine)\b/.test(r);
  const told = r.match(/\b([a-z][a-z'-]+)\s+(?:just\s+)?(?:told me|said|says|came out with)\b/);
  const possessive = r.match(/\b([a-z][a-z'-]+)'s\s+quote\b/);
  const out = { ...ex };
  if (own) {
    out.is_own = true;
    out.speaker = null;
    out.speaker_confidence = "certain";
    return out;
  }
  const named = (told?.[1] ?? possessive?.[1]) ?? null;
  const STOP = new Set(["i", "he", "she", "they", "someone", "somebody", "who", "it", "that", "this", "you", "we"]);
  if (named && !STOP.has(named)) {
    out.is_own = false;
    out.speaker = out.speaker ?? named.charAt(0).toUpperCase() + named.slice(1);
    out.speaker_confidence = out.speaker ? "certain" : "uncertain";
    return out;
  }
  if (!out.speaker) {
    // addressee-only or no attribution: default to Phil, uncertain
    out.is_own = true;
    out.speaker_confidence = "uncertain";
  }
  return out;
}

/** "last Tuesday", "this morning", "yesterday", "on Monday", "2 days ago" → ISO or null. */
export function parseRelativeSaidAt(phrase: string | null | undefined, now = new Date()): string | null {
  if (!phrase) return null;
  const p = phrase.toLowerCase().trim();
  const d = new Date(now);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (/^(just now|now|today|this morning|this afternoon|this evening|earlier)$/.test(p)) return d.toISOString();
  if (/^yesterday$/.test(p)) {
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  const ago = p.match(/^(\d+)\s+(day|days|week|weeks)\s+ago$/);
  if (ago) {
    const n = Number(ago[1]) * (ago[2].startsWith("week") ? 7 : 1);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }
  const dow = p.match(/^(?:last|on|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (dow) {
    const target = days.indexOf(dow[1]);
    let back = (d.getDay() - target + 7) % 7;
    if (back === 0) back = 7; // "last Tuesday" on a Tuesday means a week ago
    d.setDate(d.getDate() - back);
    return d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(p) && !Number.isNaN(Date.parse(p))) return new Date(p).toISOString();
  return null;
}

/** The channel read-back (spec decision 4). */
export function readBack(ex: QuoteExtraction, personName: string | null): string {
  const who = ex.is_own ? "You" : (personName ?? ex.speaker ?? "Someone");
  const unc = ex.speaker_confidence === "uncertain" ? " (speaker uncertain)" : "";
  return `Saved for review — ${who}: "${ex.text}"${unc}`;
}
