/**
 * Allowlist HTML sanitiser for `*_html` fields in steps definitions
 * (checklists spec §3.1: trusted content authored by Claude in the repo and
 * reviewed by Phil — sanitise on render anyway). No dependency: the app has
 * no DOMPurify. Isomorphic and deterministic.
 */

const ALLOWED = new Set([
  "p", "br", "strong", "em", "b", "i", "u", "s", "code", "pre", "kbd",
  "ul", "ol", "li", "a", "h3", "h4", "h5", "span", "div", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td", "hr", "small", "sup", "sub",
]);
const ALLOWED_ATTR: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  "*": new Set(["class", "title"]),
};

function cleanAttrs(tag: string, attrs: string): string {
  const out: string[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs))) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    if (name.startsWith("on")) continue;
    const ok = ALLOWED_ATTR[tag]?.has(name) || ALLOWED_ATTR["*"].has(name);
    if (!ok) continue;
    if (name === "href") {
      const v = value.trim();
      if (!/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(v)) continue;
      out.push(`href="${v.replace(/"/g, "&quot;")}"`);
      if (/^https?:\/\//i.test(v)) out.push('target="_blank" rel="noreferrer"');
      continue;
    }
    if (name === "target" || name === "rel") continue; // set from href above
    out.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  return out.length ? " " + out.join(" ") : "";
}

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  // drop script/style blocks wholesale
  let s = html.replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (whole, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED.has(tag)) return "";
    const closing = whole.startsWith("</");
    if (closing) return `</${tag}>`;
    const selfClose = tag === "br" || tag === "hr" ? " /" : "";
    return `<${tag}${cleanAttrs(tag, rawAttrs)}${selfClose}>`;
  });
  return s;
}

/** Escape text for safe insertion into an HTML context. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
