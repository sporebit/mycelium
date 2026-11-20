/**
 * Hacker News watcher, through the public Algolia search API (no key).
 * Stories above a points floor, on the topics watched, from the last few
 * days. Pure parsing; the fetch is passed in.
 */
import type { Candidate } from "../types";
import { kindFromHost, normaliseUrl } from "../url";

export type HnQuery = { label: string; query: string; minPoints: number };

export const HN_QUERIES: HnQuery[] = [
  { label: "Claude Code and MCP", query: "Claude Code OR MCP server OR agent skills", minPoints: 40 },
  { label: "AI agents", query: "AI agents OR coding agent OR LLM agent", minPoints: 120 },
  { label: "design and UI", query: "design system OR UI animation OR interface design", minPoints: 80 },
];

type Hit = { objectID?: unknown; title?: unknown; url?: unknown; points?: unknown; num_comments?: unknown; author?: unknown; created_at?: unknown };

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function hnSearchUrl(query: string, sinceEpochSeconds: number, minPoints: number): string {
  return `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&numericFilters=${encodeURIComponent(`points>${minPoints},created_at_i>${sinceEpochSeconds}`)}&hitsPerPage=20`;
}

/** The candidates in one reply. A story's own link is the find; the HN thread is kept as a reference. */
export function parseHnSearch(body: unknown, query: HnQuery): Candidate[] {
  const hits = (body && typeof body === "object" && Array.isArray((body as { hits?: unknown }).hits) ? (body as { hits: Hit[] }).hits : []) as Hit[];
  const out: Candidate[] = [];
  for (const h of hits) {
    const title = s(h.title);
    const id = s(h.objectID);
    if (!title || !id) continue;
    const thread = `https://news.ycombinator.com/item?id=${id}`;
    const url = normaliseUrl(s(h.url) ?? thread);
    if (!url) continue;
    const points = n(h.points);
    if (points < query.minPoints) continue;
    out.push({
      url,
      title,
      source: "hn",
      source_ref: query.label,
      kind: kindFromHost(url) ?? "article",
      raw: { points, comments: n(h.num_comments), author: s(h.author), thread, created_at: s(h.created_at) },
    });
  }
  return out;
}

export async function watchHn(fetchImpl: typeof fetch, now: Date, days = 7, queries = HN_QUERIES): Promise<{ found: Candidate[]; errors: string[] }> {
  const since = Math.floor((now.getTime() - days * 86_400_000) / 1000);
  const found: Candidate[] = [];
  const errors: string[] = [];
  for (const q of queries) {
    try {
      const res = await fetchImpl(hnSearchUrl(q.query, since, q.minPoints), { headers: { "user-agent": "mycelium-finds" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        errors.push(`${q.label}: Hacker News answered ${res.status}`);
        continue;
      }
      found.push(...parseHnSearch(await res.json(), q));
    } catch (err) {
      errors.push(`${q.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { found, errors };
}
