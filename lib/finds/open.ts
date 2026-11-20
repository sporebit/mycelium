/**
 * Opening a find: the page's own text, small enough for a prompt. A GitHub
 * repo gives its README through the API; anything else is fetched as HTML
 * and stripped. Public http(s) hosts only; a link into a private network
 * is never followed. Pure apart from the fetch passed in.
 */
import { githubHeaders, githubReadmeUrl } from "./watchers/github";
import { isGithubRepo } from "./url";

export const OPEN_MAX_CHARS = 9_000;

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.(local|internal|lan)$)/i;

/** True for a public web address: http(s), a named or public host. */
export function openable(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (PRIVATE_HOST.test(u.hostname)) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Readable text from HTML: no scripts, styles, nav, tags or entities; whitespace folded. Pure. */
export function htmlToText(html: string): string {
  const main = html.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? html;
  return main
    .replace(/<(script|style|noscript|svg|nav|footer|header|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export type Opened = { text: string; via: "readme" | "page" } | { text: null; via: "skipped" | "failed"; reason: string };

export async function openFind(fetchImpl: typeof fetch, url: string, opts: { maxChars?: number; timeoutMs?: number } = {}): Promise<Opened> {
  const max = opts.maxChars ?? OPEN_MAX_CHARS;
  if (!openable(url)) return { text: null, via: "skipped", reason: "not a public web address" };
  try {
    const readme = isGithubRepo(url) ? githubReadmeUrl(url) : null;
    if (readme) {
      const res = await fetchImpl(readme, { headers: { ...githubHeaders(), accept: "application/vnd.github.raw+json" }, signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000) });
      if (res.ok) {
        const text = (await res.text()).slice(0, max * 3);
        return { text: htmlToText(text.replace(/<[^>]+>/g, " ")).slice(0, max), via: "readme" };
      }
      // No README (or private): fall through to the page itself.
    }
    const res = await fetchImpl(url, { headers: { "user-agent": "mycelium-finds", accept: "text/html, text/plain, application/xhtml+xml" }, signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000), redirect: "follow" });
    if (!res.ok) return { text: null, via: "failed", reason: `the page answered ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/|xml|json/.test(type)) return { text: null, via: "skipped", reason: `not a text page (${type.split(";")[0]})` };
    const body = (await res.text()).slice(0, 1_500_000);
    const text = htmlToText(body).slice(0, max);
    if (!text) return { text: null, via: "failed", reason: "no readable text" };
    return { text, via: "page" };
  } catch (err) {
    return { text: null, via: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}
