/**
 * A fetch that answers from files instead of the network, for the e2e run
 * (FINDS_FIXTURE_DIR) and the unit tests. Each watcher's host maps to one
 * file in the directory; an unknown host gets a 404. No test ever reaches
 * the real GitHub, Hacker News or a feed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const FIXTURE_FILES: Array<[RegExp, string, string]> = [
  [/^api\.github\.com$/, "advisories.json", "application/json"],
  [/^hn\.algolia\.com$/, "hn-search.json", "application/json"],
  [/^news\.ycombinator\.com$/, "page.html", "text/html"],
];

/** The file a URL answers from. GitHub has three shapes on one host, told apart by path. */
export function fixtureFor(url: string): { file: string; type: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname === "api.github.com") {
    if (u.pathname.startsWith("/search/repositories")) return { file: "github-search.json", type: "application/json" };
    if (u.pathname.startsWith("/advisories")) return { file: "advisories.json", type: "application/json" };
    if (/\/readme$/.test(u.pathname)) return { file: "readme.md", type: "text/plain" };
    return null;
  }
  for (const [re, file, type] of FIXTURE_FILES) if (re.test(u.hostname)) return { file, type };
  if (/\.(xml|rss|atom)$|\/(rss|atom|feed)\b/i.test(u.pathname) || /feed/i.test(u.hostname)) return { file: "feed.xml", type: "application/atom+xml" };
  return { file: "page.html", type: "text/html" };
}

export function fixtureFetch(dir: string): typeof fetch {
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const hit = fixtureFor(url);
    const file = hit ? path.join(dir, hit.file) : null;
    if (!file || !existsSync(file)) return new Response("not in the fixtures", { status: 404 });
    return new Response(readFileSync(file), { status: 200, headers: { "content-type": hit!.type } });
  };
  return impl as typeof fetch;
}

/** The fetch the watchers use: the fixtures when FINDS_FIXTURE_DIR is set (the e2e server), the network otherwise. */
export function watcherFetch(): typeof fetch {
  const dir = process.env.FINDS_FIXTURE_DIR;
  return dir ? fixtureFetch(dir) : fetch;
}
