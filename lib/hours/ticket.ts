/**
 * The Ticket field (spec §3, "Ticket field and links"). It accepts a URL or
 * a key. If the text contains `browse/`, the key is what follows, up to any
 * `?`, `#` or `/`. Otherwise the trimmed text is the key. A URL with no
 * `browse/` (a Confluence page, say) is a plain link with no key, so it is
 * excluded from by-ticket grouping. D3: links only, never a fetch.
 */

export type ParsedTicket = {
  /** The Jira-style key, or null when the text is a non-ticket URL or empty. */
  key: string | null;
  /** Where the link goes: the pasted URL when there was one, else base + key. Null when empty. */
  url: string | null;
  /** True when the text is a URL that is not a ticket link. */
  isPlainLink: boolean;
};

const KEY_SHAPE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

export function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

export function parseTicket(raw: string | null | undefined, baseUrl: string): ParsedTicket {
  const text = (raw ?? "").trim();
  if (!text) return { key: null, url: null, isPlainLink: false };
  const at = text.indexOf("browse/");
  if (at >= 0) {
    const after = text.slice(at + "browse/".length);
    const key = after.split(/[?#/]/)[0].trim();
    if (!key) return { key: null, url: isUrl(text) ? text : null, isPlainLink: isUrl(text) };
    return { key: normaliseKey(key), url: isUrl(text) ? text : joinBase(baseUrl, key), isPlainLink: false };
  }
  if (isUrl(text)) return { key: null, url: text, isPlainLink: true };
  const key = normaliseKey(text);
  return { key, url: joinBase(baseUrl, key), isPlainLink: false };
}

/** `abc-12` and `ABC-12` are the same ticket; anything else is kept as typed. */
export function normaliseKey(key: string): string {
  const k = key.trim();
  return KEY_SHAPE.test(k) ? k.toUpperCase() : k;
}

export function joinBase(baseUrl: string, key: string): string | null {
  const base = (baseUrl ?? "").trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(key)}`;
}

/** The key column value for a row: derived from the raw text, never stored by hand. */
export function keyFor(raw: string | null | undefined): string | null {
  return parseTicket(raw, "").key;
}
