/**
 * GitHub watcher: new and rising repos for agent skills, MCP servers and
 * design tools, from the free search API (no key needed; GITHUB_TOKEN in
 * env raises the rate limit). Pure parsing; the fetch is passed in.
 */
import type { Candidate } from "../types";
import { normaliseUrl } from "../url";

export type GithubQuery = { label: string; q: string; minStars: number };

/** What is watched by default. A query is what the search box would take; `created:>` is added per run. */
export const GITHUB_QUERIES: GithubQuery[] = [
  { label: "MCP servers", q: "topic:mcp-server", minStars: 25 },
  { label: "agent skills", q: "topic:agent-skills OR topic:claude-skills OR topic:claude-code", minStars: 15 },
  { label: "AI agents", q: "topic:ai-agents OR topic:llm-agents", minStars: 60 },
  { label: "design tools", q: "topic:design-system OR topic:ui-components OR topic:motion-design", minStars: 60 },
];

type SearchItem = {
  html_url?: unknown;
  full_name?: unknown;
  description?: unknown;
  stargazers_count?: unknown;
  language?: unknown;
  license?: { spdx_id?: unknown; name?: unknown } | null;
  topics?: unknown;
  created_at?: unknown;
  pushed_at?: unknown;
  archived?: unknown;
  fork?: unknown;
};

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The search URL for a query over repos created since `since` (YYYY-MM-DD), best first. */
export function githubSearchUrl(q: string, since: string): string {
  return `https://api.github.com/search/repositories?q=${encodeURIComponent(`${q} created:>${since} archived:false`)}&sort=stars&order=desc&per_page=20`;
}

/** The candidates in one search reply: forks and archived repos left out, below the star floor left out. */
export function parseGithubSearch(body: unknown, query: GithubQuery): Candidate[] {
  const items = (body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items) ? (body as { items: SearchItem[] }).items : []) as SearchItem[];
  const out: Candidate[] = [];
  for (const it of items) {
    const url = s(it.html_url) ? normaliseUrl(s(it.html_url)!) : null;
    const name = s(it.full_name);
    if (!url || !name || it.fork === true || it.archived === true) continue;
    const stars = n(it.stargazers_count);
    if (stars < query.minStars) continue;
    const topics = Array.isArray(it.topics) ? (it.topics as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 8) : [];
    const skill = topics.some((t) => /skill|claude-code|mcp/.test(t));
    out.push({
      url,
      title: name,
      source: "github",
      source_ref: query.label,
      kind: skill ? "skill" : "repo",
      raw: {
        stars,
        language: s(it.language),
        licence: s(it.license?.spdx_id) ?? s(it.license?.name),
        topics,
        snippet: s(it.description)?.slice(0, 400) ?? null,
        created_at: s(it.created_at),
        pushed_at: s(it.pushed_at),
      },
    });
  }
  return out;
}

/** The README of a repo, as text, for the verdict; null when it cannot be read. */
export function githubReadmeUrl(repoUrl: string): string | null {
  try {
    const parts = new URL(repoUrl).pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `https://api.github.com/repos/${parts[0]}/${parts[1]}/readme`;
  } catch {
    return null;
  }
}

export function githubHeaders(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "mycelium-finds" };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

/** Run every query over the last `days` days. Errors are returned, not thrown: one failed query does not stop the others. */
export async function watchGithub(fetchImpl: typeof fetch, now: Date, days = 7, queries = GITHUB_QUERIES): Promise<{ found: Candidate[]; errors: string[] }> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const found: Candidate[] = [];
  const errors: string[] = [];
  for (const q of queries) {
    try {
      const res = await fetchImpl(githubSearchUrl(q.q, since), { headers: githubHeaders(), signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        errors.push(`${q.label}: GitHub answered ${res.status}`);
        continue;
      }
      found.push(...parseGithubSearch(await res.json(), q));
    } catch (err) {
      errors.push(`${q.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { found, errors };
}
