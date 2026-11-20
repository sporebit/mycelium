/**
 * Gift-idea extraction from a captured sentence, pure (spec §4.3). The
 * model's extraction is cleaned here too, so the rules hold whichever path
 * produced it:
 *
 *   "get X a Y" / "a Y for X" / "X wants a Y" / "X would love a Y"  → person X, title Y
 *   "for his birthday" / "for Christmas" / "for Valentine's"         → occasion kind
 *   anything after "because" / "he said" / "she's always"            → reason
 *   a URL anywhere                                                   → url
 *   "£40" / "about 40 quid" / "under £50"                            → target_price
 *   "by Friday" / "before the 23rd" / "next month"                   → needed_by_relative (left as said)
 *
 * The signal words are also what the regex fallback classifier uses to
 * recognise a gift idea when no model answers.
 */
import type { OccasionKind } from "./types";

export type GiftExtraction = {
  title: string;
  person: string | null;
  reason: string | null;
  occasion: OccasionKind | null;
  url: string | null;
  target_price: number | null;
  needed_by_relative: string | null;
};

const URL_RE = /https?:\/\/[^\s)]+/i;
const PRICE_RE = /(?:£|\$|€)\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:quid|pounds|gbp)\b/i;
const OCCASION_RE: Array<[RegExp, OccasionKind]> = [
  [/\b(birthday|bday|b-day|turns? \d+|turning \d+)\b/i, "birthday"],
  [/\b(christmas|xmas|stocking)\b/i, "christmas"],
  [/\b(valentine'?s?|valentines)\b/i, "valentines"],
  [/\b(anniversary)\b/i, "anniversary"],
  [/\b(graduation|graduat(?:es|ing))\b/i, "graduation"],
  [/\b(new job|promotion|leaving (?:do|present|gift))\b/i, "new_job"],
  [/\b(wedding|getting married)\b/i, "wedding"],
  [/\b(new baby|baby shower|christening)\b/i, "new_baby"],
  [/\b(housewarming|house-warming|new (?:house|flat|home))\b/i, "housewarming"],
  [/\b(thank[- ]you (?:gift|present)|to say thanks)\b/i, "thank_you"],
];
const REASON_RE = /\b(?:because|since|as|cos|coz|'cause)\b\s+(.+)$|\b((?:he|she|they)(?:'s| is| are| was| were| said| keeps?| always| mentioned)\b.+)$/i;
const NEEDED_RE = /\b(by|before)\s+((?:next|this)\s+\w+|the\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+of\s+\w+)?|\w+day|tomorrow|\d{1,2}(?:st|nd|rd|th)?\s+\w+)\b/i;
// Names keep their capitals: these three patterns are case-sensitive on the
// name and case-insensitive on the words around it (built by hand, since one
// flag covers a whole expression).
const NAME = String.raw`([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?|[Mm]um|[Mm]am|[Dd]ad|[Nn]an|[Gg]ran|[Gg]randad|[Gg]randma|[Gg]randpa|[Mm]y (?:mum|dad|nan|gran|brother|sister|wife|husband|partner|boss|mate|friend))`;
const ci = (word: string) => word.split("|").map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join("|");
const GET_FOR_RE = new RegExp(String.raw`\b(?:${ci("get|buy|grab|find|order|pick")}(?: up)?)\s+${NAME}\s+(?:a|an|some|the)?\s*(.+)$`);
/** "Present for Dan's wedding: a decanter" — the thing comes after the colon. */
const PRESENT_FOR_RE = new RegExp(String.raw`^(?:[Gg]ift|[Pp]resent|[Pp]ressie)s?(?: idea)?\s+for\s+${NAME}(?:'s)?(?:\s+[\w' ]+?)?\s*[:,-]\s*(.+)$`);
const FOR_RE = new RegExp(String.raw`^(.+?)\s+[Ff]or\s+${NAME}(?:'s)?(?:\s+(?:birthday|christmas|xmas|valentine'?s?|anniversary|graduation|wedding|new job))?\b`);
const WANTS_RE = new RegExp(String.raw`\b${NAME}\s+(?:wants?|would love|would like|has been after|is after|keeps? (?:going on|talking) about|mentioned)\s+(?:a|an|some|the)?\s*(.+)$`);
const FOR_HIS_RE = /\s+for\s+(?:his|her|their|the|its)\s+(?:\w+\s+)?(?:birthday|bday|christmas|xmas|valentine'?s?|anniversary|graduation|wedding|new job|new baby|housewarming)\b.*$/i;
const LEAD_RE = /^(?:(?:stocking filler|gift|present|pressie)\s+ideas?|gift|present|idea)\s*[:,-]\s*/i;

const FRAMING_RE = /^(?:(?:a|an|the)\s+)?(?:gift|present)\s+(?:idea\s+)?(?:for|of)\s+/i;

function clean(s: string): string {
  return s
    .replace(URL_RE, "")
    .replace(/[\s,;:.!?-]+$/g, "")
    .replace(/^[\s,;:.-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "mum" → "Mum"; "my brother" stays as said. */
function personCase(name: string): string {
  const n = name.trim().replace(/['’]s$/, "");
  if (/^my\s/i.test(n)) return n.toLowerCase();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function extractGiftFromText(raw: string): GiftExtraction {
  const text = raw.replace(/\s+/g, " ").trim();
  const url = text.match(URL_RE)?.[0] ?? null;
  let body = text.replace(URL_RE, " ").replace(/\s+/g, " ").trim();

  // the occasion is read off the whole sentence before any framing is stripped
  let occasion: OccasionKind | null = null;
  for (const [re, kind] of OCCASION_RE) {
    if (re.test(body)) {
      occasion = kind;
      break;
    }
  }
  body = body.replace(LEAD_RE, "");

  let reason: string | null = null;
  const r = body.match(REASON_RE);
  if (r) {
    reason = clean(r[1] ?? r[2] ?? "");
    body = body.slice(0, r.index).trim();
  }

  let neededBy: string | null = null;
  const nb = body.match(NEEDED_RE);
  if (nb) {
    neededBy = `${nb[1]} ${nb[2]}`.toLowerCase();
    body = (body.slice(0, nb.index) + body.slice(nb.index! + nb[0].length)).replace(/\s+/g, " ").trim();
  }

  let price: number | null = null;
  const pm = body.match(PRICE_RE);
  if (pm) {
    price = Number((pm[1] ?? pm[2]).replace(",", "."));
    body = (body.slice(0, pm.index) + body.slice(pm.index! + pm[0].length)).replace(/\b(?:about|around|roughly|under|up to|max|budget(?: of)?|for)\s*$/i, "").replace(/\s+/g, " ").trim();
  }

  let person: string | null = null;
  let title = body;
  const m0 = body.match(PRESENT_FOR_RE);
  const m1 = body.match(GET_FOR_RE);
  const m2 = body.match(WANTS_RE);
  const m3 = body.match(FOR_RE);
  if (m0) {
    person = personCase(m0[1]);
    title = m0[2];
  } else if (m1) {
    person = personCase(m1[1]);
    title = m1[2];
  } else if (m2) {
    person = personCase(m2[1]);
    title = m2[2];
  } else if (m3) {
    title = m3[1];
    person = personCase(m3[2]);
  }
  title = clean(title.replace(FOR_HIS_RE, "").replace(FRAMING_RE, ""));
  // "for his birthday" at the end of the title when the person came first
  title = clean(title.replace(/\s+for\s+(?:his|her|their)\s+\w+$/i, ""));
  if (!title) title = clean(text.split(/\s+/).slice(0, 8).join(" ")) || "Gift idea";

  return { title: title.slice(0, 200), person, reason: reason || null, occasion, url, target_price: price, needed_by_relative: neededBy };
}

/** Words that say a sentence is a gift idea (the fallback classifier's signal; the model has the same list in its prompt). */
export const GIFT_SIGNAL_RE = /\b(gift|gifts|present|presents|pressie|prezzie|stocking filler|for (?:his|her|their|\w+'s) (?:birthday|bday|christmas|xmas|anniversary|wedding|graduation))\b/i;

/** Read-back for the channel (spec §4.6): "Saved for review — gift idea for Jake: "decent chef's knife" (birthday)". */
export function giftReadBack(ex: Pick<GiftExtraction, "title" | "person" | "occasion">, resolvedName: string | null): string {
  const who = resolvedName ?? ex.person;
  const head = who ? `gift idea for ${who}` : "gift idea";
  const occ = ex.occasion ? ` (${ex.occasion.replace("_", " ")})` : "";
  const unresolved = ex.person && !resolvedName ? " (person unresolved)" : "";
  return `Saved for review — ${head}: "${ex.title}"${occ}${unresolved}`;
}

/** The extraction as the classifier stores it, cleaned whichever path made it. */
export function giftFromClassification(c: Record<string, unknown>, rawText: string): GiftExtraction {
  const g = (c.gift as Partial<GiftExtraction> | null | undefined) ?? null;
  const fallback = extractGiftFromText(rawText);
  if (!g) return fallback;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const occ = typeof g.occasion === "string" && OCCASION_RE.some(([, k]) => k === g.occasion) ? (g.occasion as OccasionKind) : fallback.occasion;
  const price = typeof g.target_price === "number" && Number.isFinite(g.target_price) ? g.target_price : fallback.target_price;
  return {
    title: (str(g.title) ?? str(c.title) ?? fallback.title).slice(0, 200),
    person: str(g.person) ?? fallback.person,
    reason: str(g.reason) ?? fallback.reason,
    occasion: occ,
    url: str(g.url) ?? fallback.url,
    target_price: price,
    needed_by_relative: str(g.needed_by_relative) ?? fallback.needed_by_relative,
  };
}
