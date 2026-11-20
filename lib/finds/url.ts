/**
 * Links: the one key a find is kept by, and what kind of thing a link is.
 * Pure.
 */
import type { FindKind } from "./types";

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|ref|ref_src|s|t|si|igshid|mc_cid|mc_eid)$/i;

/**
 * The same page always gives the same key: scheme and host lowered,
 * tracking parameters and fragments dropped, a trailing slash removed,
 * x.com and twitter.com read as one site, mobile GitHub as GitHub.
 */
export function normaliseUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  let host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^mobile\./, "");
  if (host === "twitter.com" || host === "mobile.twitter.com") host = "x.com";
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const search = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";
  const path = u.pathname.replace(/\/+$/, "") || "";
  return `https://${host}${path}${search}`;
}

/** Every http(s) link in a text, in order, as written. */
export function linksIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>()"']+/gi)) out.push(m[0].replace(/[.,;:!?)\]]+$/, ""));
  return out;
}

/** Hosts whose links are a find without asking a model: a repo, a post, a skill, a tool, a paper. */
const FIND_HOSTS: Array<[RegExp, FindKind]> = [
  [/^(gist\.)?github\.com$/, "repo"],
  [/^gitlab\.com$/, "repo"],
  [/^huggingface\.co$/, "repo"],
  [/^(www\.)?npmjs\.com$/, "repo"],
  [/^pypi\.org$/, "repo"],
  [/^x\.com$/, "post"],
  [/^bsky\.app$/, "post"],
  [/^(news\.ycombinator\.com)$/, "post"],
  [/^(www\.)?reddit\.com$/, "post"],
  [/^(www\.)?producthunt\.com$/, "tool"],
  [/^(skills\.sh|smithery\.ai|mcp\.so|glama\.ai|cursor\.directory|skillsmp\.com)$/, "skill"],
  [/^arxiv\.org$/, "article"],
];

/** The kind of thing a link is from its host alone, or null when the host says nothing. */
export function kindFromHost(url: string): FindKind | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (host === "twitter.com") host = "x.com";
  for (const [re, kind] of FIND_HOSTS) if (re.test(host)) return kind;
  return null;
}

/** A GitHub repo page, with a path like /owner/name (not an issue, a user page or a gist). */
export function isGithubRepo(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname.replace(/^www\./, "") !== "github.com") return false;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length === 2 && !["topics", "search", "orgs", "settings", "marketplace", "sponsors"].includes(parts[0]);
  } catch {
    return false;
  }
}

export type ShareRead = { url: string; kind: FindKind; title: string } | null;

/**
 * A capture that is a link to a find host, with at most a few words around
 * it ("look at this later https://github.com/…"), is a find and nothing
 * else; the words become its title. Anything longer, or a link to another
 * kind of site (a shop, a video), is left to the classifier.
 */
export function readShare(text: string): ShareRead {
  const links = linksIn(text);
  if (links.length !== 1) return null;
  const url = normaliseUrl(links[0]);
  if (!url) return null;
  const kind = kindFromHost(url);
  if (!kind) return null;
  const words = text.replace(links[0], " ").replace(/\s+/g, " ").trim();
  if (words.split(" ").filter(Boolean).length > 14) return null;
  return { url, kind, title: words.replace(/^[-–:—,]+|[-–:—,]+$/g, "").trim() || titleFromUrl(url) };
}

/** "owner/name" for a repo, the host and path for anything else. */
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    if (host === "github.com" && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    if (host === "x.com" && parts.length >= 1) return `a post by @${parts[0]}`;
    return parts.length ? `${host}/${parts.slice(0, 2).join("/")}` : host;
  } catch {
    return url;
  }
}
