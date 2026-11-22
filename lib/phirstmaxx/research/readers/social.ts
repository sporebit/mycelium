/**
 * PhirstMaxx research — Instagram, Facebook and TikTok links (spec §6 step 1).
 *
 * Plainly: these sites block signed-out readers, so a shared link on its
 * own usually gives nothing. What the pipeline relies on is what the share
 * sheet sent with the link — the caption text and the image or a
 * screenshot — read by the vision stage. This reader is a bonus, tried
 * once per link: TikTok's public oEmbed (free, no key), otherwise the
 * page's OpenGraph meta with no cookies and no login. Meta's own oEmbed
 * needs an app token, so it is not used. Nothing here scrapes behind a
 * login or retries to get round a block.
 *
 * `blocked: true` is the normal answer and not a fault: it means the page
 * gave no caption and no picture worth keeping (a login wall, a generic
 * "Instagram" title, a 4xx). Limits: one request, 10 s, 1 MB.
 */
import type { Fact } from "./index";
import { fetchCapped, fetchJson, parseHtml, pickFetch, USER_AGENT, utf8, type FetchLike } from "./website";

export type SocialKind = "instagram" | "facebook" | "tiktok";

const HOSTS: Array<[RegExp, SocialKind]> = [
  [/^(?:www\.|m\.)?(?:instagram\.com|instagr\.am)$/i, "instagram"],
  [/^(?:www\.|m\.|web\.|l\.|mbasic\.)?(?:facebook\.com|fb\.com|fb\.watch|fb\.me)$/i, "facebook"],
  [/^(?:www\.|m\.|vm\.|vt\.)?tiktok\.com$/i, "tiktok"],
];

/** Which of the three a link belongs to (short links included), or null. */
export function classifySocial(url: string): SocialKind | null {
  try {
    const host = new URL(url.trim()).hostname;
    for (const [re, kind] of HOSTS) if (re.test(host)) return kind;
  } catch {
    return null;
  }
  return null;
}

export type SocialRead = { kind: SocialKind; url: string; caption: string | null; image: string | null; author: string | null; blocked: boolean; facts: Fact[] };

/** Titles and descriptions that are the site talking, not the post. */
const GENERIC = /^(instagram|facebook|tiktok|log ?in|sign up|login • instagram|instagram photos and videos|facebook - log in or sign up|tiktok - make your day|watch|error|page not found)\b/i;
const LOGIN_WALL = /(log in|sign up|create an account|see more from|to continue|you must log in|this content isn'?t available)/i;

/** Instagram descriptions read '12 likes, 3 comments - name on 1 May 2026: "the caption".'; keep the caption. */
function cleanCaption(raw: string | null): string | null {
  if (!raw) return null;
  const quoted = /:\s*[“"]([\s\S]+?)[”"]\s*\.?\s*$/.exec(raw);
  const text = (quoted ? quoted[1] : raw).replace(/\s+/g, " ").trim();
  if (!text || GENERIC.test(text) || (LOGIN_WALL.test(text) && text.length < 160)) return null;
  return text;
}

type TikTokOEmbed = { title?: string; author_name?: string; thumbnail_url?: string };

/** One best-effort public look at a social link. Null only when the link is not one of the three. */
export async function readSocial(url: string, fetchImpl?: FetchLike): Promise<SocialRead | null> {
  const kind = classifySocial(url);
  if (!kind) return null;
  const f = pickFetch(fetchImpl);
  let caption: string | null = null;
  let image: string | null = null;
  let author: string | null = null;
  let source: "oembed" | "opengraph" = "opengraph";
  let sourceUrl = url;

  if (kind === "tiktok") {
    const o = await fetchJson<TikTokOEmbed>(f, `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } }, 10_000);
    if (o) {
      caption = cleanCaption(typeof o.title === "string" ? o.title : null);
      image = typeof o.thumbnail_url === "string" ? o.thumbnail_url : null;
      author = typeof o.author_name === "string" ? o.author_name : null;
      source = "oembed";
    }
  } else {
    const got = await fetchCapped(f, url, { headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-GB,en;q=0.9", "User-Agent": USER_AGENT } }, { timeoutMs: 10_000 });
    if (got && /html/i.test(got.res.headers.get("content-type") ?? "html")) {
      const page = parseHtml(utf8(got.bytes), got.url);
      sourceUrl = got.url;
      const wall = /\/(login|accounts\/login|checkpoint)\b/i.test(new URL(got.url).pathname);
      if (!wall) {
        caption = cleanCaption(page.description) ?? cleanCaption(page.title);
        image = page.image;
      }
    }
  }

  const blocked = !caption && !image;
  const facts: Fact[] = [];
  if (caption) facts.push({ key: "social_caption", value: caption, source_url: sourceUrl, source_kind: source, confidence: 0.5 });
  if (image) facts.push({ key: "image", value: image, source_url: sourceUrl, source_kind: source, confidence: 0.4 });
  if (author) facts.push({ key: "social_author", value: author, source_url: sourceUrl, source_kind: source, confidence: 0.6 });
  return { kind, url: sourceUrl, caption, image, author, blocked, facts };
}
