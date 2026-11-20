/**
 * Security advisories for the app's own dependencies, two ways:
 *   - the GitHub Advisory Database (REST, no key: /advisories?ecosystem=npm&affects=…),
 *     asked in chunks for the packages in package.json at their installed
 *     versions; runs in the cloud on the daily tick.
 *   - `npm audit --json`, run on the PC lane by the worker in the repo
 *     checkout, whose result the handler turns into the same candidates.
 * Pure parsing; the fetch is passed in.
 */
import type { Candidate } from "../types";

type Advisory = {
  ghsa_id?: unknown;
  cve_id?: unknown;
  html_url?: unknown;
  summary?: unknown;
  severity?: unknown;
  published_at?: unknown;
  vulnerabilities?: Array<{ package?: { name?: unknown; ecosystem?: unknown }; vulnerable_version_range?: unknown; first_patched_version?: unknown }>;
};

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** "name@version" for every dependency, from package.json and the lock's installed versions when given. */
export function dependencyList(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }, installed: Record<string, string> = {}): string[] {
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  return [...new Set(names)].sort().map((name) => {
    const v = installed[name] ?? (pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? "").replace(/^[\^~>=<\s]+/, "");
    return /^\d/.test(v) ? `${name}@${v}` : name;
  });
}

/** The `affects` parameter takes a comma-separated list of at most 1000 characters: split the list to fit. */
export function affectsChunks(deps: string[], max = 950): string[] {
  const chunks: string[] = [];
  let cur: string[] = [];
  for (const d of deps) {
    const next = [...cur, d].join(",");
    if (next.length > max && cur.length) {
      chunks.push(cur.join(","));
      cur = [d];
    } else cur.push(d);
  }
  if (cur.length) chunks.push(cur.join(","));
  return chunks;
}

export const advisoriesUrl = (affects: string) => `https://api.github.com/advisories?ecosystem=npm&per_page=100&affects=${encodeURIComponent(affects)}`;

export function parseAdvisories(body: unknown): Candidate[] {
  const list = (Array.isArray(body) ? body : []) as Advisory[];
  const out: Candidate[] = [];
  for (const a of list) {
    const id = s(a.ghsa_id);
    const url = s(a.html_url) ?? (id ? `https://github.com/advisories/${id}` : null);
    const summary = s(a.summary);
    if (!url || !summary) continue;
    const packages = (a.vulnerabilities ?? []).map((v) => ({ name: s(v.package?.name), range: s(v.vulnerable_version_range), fixed: s(v.first_patched_version) })).filter((v) => v.name);
    out.push({
      url,
      title: `${(s(a.severity) ?? "advisory").toUpperCase()}: ${summary}`.slice(0, 300),
      source: "advisory",
      source_ref: packages.map((p) => p.name).join(", ") || null,
      kind: "advisory",
      raw: { ghsa: id, cve: s(a.cve_id), severity: s(a.severity), published: s(a.published_at), packages },
    });
  }
  return out;
}

export async function watchAdvisories(fetchImpl: typeof fetch, deps: string[], headers: Record<string, string>): Promise<{ found: Candidate[]; errors: string[] }> {
  const found: Candidate[] = [];
  const errors: string[] = [];
  for (const chunk of affectsChunks(deps)) {
    try {
      const res = await fetchImpl(advisoriesUrl(chunk), { headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        errors.push(`advisories: GitHub answered ${res.status}`);
        continue;
      }
      found.push(...parseAdvisories(await res.json()));
    } catch (err) {
      errors.push(`advisories: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { found, errors };
}

/**
 * `npm audit --json` (npm 7+ shape): one candidate per vulnerable package,
 * the advisory's own page as the URL when npm gives one.
 */
export function parseNpmAudit(body: unknown): Candidate[] {
  const vulns = (body && typeof body === "object" && (body as { vulnerabilities?: unknown }).vulnerabilities) as Record<string, { name?: unknown; severity?: unknown; range?: unknown; fixAvailable?: unknown; via?: unknown[] }> | undefined;
  if (!vulns || typeof vulns !== "object") return [];
  const out: Candidate[] = [];
  for (const [name, v] of Object.entries(vulns)) {
    const via = (Array.isArray(v.via) ? v.via : []).filter((x): x is { url?: unknown; title?: unknown; severity?: unknown } => !!x && typeof x === "object");
    const first = via.find((x) => s(x.url)) ?? via[0];
    const url = (first && s(first.url)) ?? `https://www.npmjs.com/package/${name}`;
    const title = `${(s(v.severity) ?? "advisory").toUpperCase()}: ${name} — ${(first && s(first.title)) ?? "vulnerable version installed"}`.slice(0, 300);
    out.push({
      url,
      title,
      source: "audit",
      source_ref: name,
      kind: "advisory",
      raw: { severity: s(v.severity), range: s(v.range), fix_available: v.fixAvailable === true || (typeof v.fixAvailable === "object" && v.fixAvailable !== null), via: via.map((x) => s(x.title)).filter(Boolean).slice(0, 5) },
    });
  }
  return out;
}
