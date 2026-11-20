/**
 * RSS and Atom watcher. No dependency: a small reader for the two shapes
 * that cover nearly every feed (RSS 2.0 <item>, Atom <entry>). Pure
 * parsing; the fetch is passed in. A newsletter inbox over IMAP is a named
 * source kind ("imap") with no reader yet: the mailbox is Phil's (MYC-201).
 */
import type { Candidate } from "../types";
import { kindFromHost, normaliseUrl } from "../url";

export type Feed = { label: string; url: string };

/** A small starting set; the page adds and removes feeds. */
export const DEFAULT_FEEDS: Feed[] = [
  { label: "Anthropic news", url: "https://www.anthropic.com/rss.xml" },
  { label: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
  { label: "Vercel blog", url: "https://vercel.com/atom" },
  { label: "Supabase blog", url: "https://supabase.com/rss.xml" },
  { label: "Hacker Newsletter", url: "https://mailchi.mp/hackernewsletter/rss" },
];

export type FeedEntry = { title: string; link: string; published: string | null; summary: string | null };

const decode = (v: string) =>
  v
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
const strip = (html: string) =>
  decode(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
const tag = (block: string, name: string): string | null => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
};

/** Atom's link is an attribute: <link rel="alternate" href="…"/>; the first alternate (or the first link) wins. */
function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) ?? links.find((a) => !/rel=/i.test(a)) ?? links[0];
  const href = pick?.match(/href=["']([^"']+)["']/i);
  return href ? decode(href[1]) : null;
}

/** The entries of a feed, newest first as the feed gives them. Returns [] for anything that is not a feed. */
export function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const entries = items.length ? [] : [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  for (const block of items) {
    const title = tag(block, "title");
    const link = tag(block, "link") ?? tag(block, "guid");
    if (!title || !link) continue;
    out.push({ title: strip(title), link: link.trim(), published: tag(block, "pubDate") ?? tag(block, "dc:date"), summary: tag(block, "description") ? strip(tag(block, "description")!).slice(0, 600) : null });
  }
  for (const block of entries) {
    const title = tag(block, "title");
    const link = atomLink(block);
    if (!title || !link) continue;
    const body = tag(block, "summary") ?? tag(block, "content");
    out.push({ title: strip(title), link: link.trim(), published: tag(block, "published") ?? tag(block, "updated"), summary: body ? strip(body).slice(0, 600) : null });
  }
  return out;
}

/** The entries published in the last `days` days (an entry with no date is taken as new), as candidates. */
export function feedCandidates(entries: FeedEntry[], feed: Feed, now: Date, days = 7): Candidate[] {
  const since = now.getTime() - days * 86_400_000;
  const out: Candidate[] = [];
  for (const e of entries) {
    const at = e.published ? Date.parse(e.published) : NaN;
    if (Number.isFinite(at) && at < since) continue;
    const url = normaliseUrl(e.link);
    if (!url) continue;
    out.push({ url, title: e.title.slice(0, 300), source: "rss", source_ref: feed.label, kind: kindFromHost(url) ?? "article", raw: { snippet: e.summary, published: e.published, feed: feed.url } });
  }
  return out;
}

export async function watchFeeds(fetchImpl: typeof fetch, now: Date, feeds: Feed[], days = 7): Promise<{ found: Candidate[]; errors: string[] }> {
  const found: Candidate[] = [];
  const errors: string[] = [];
  for (const feed of feeds) {
    try {
      const res = await fetchImpl(feed.url, { headers: { "user-agent": "mycelium-finds", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        errors.push(`${feed.label}: the feed answered ${res.status}`);
        continue;
      }
      const entries = parseFeed((await res.text()).slice(0, 2_000_000));
      if (!entries.length) errors.push(`${feed.label}: no entries read`);
      found.push(...feedCandidates(entries, feed, now, days));
    } catch (err) {
      errors.push(`${feed.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { found, errors };
}
