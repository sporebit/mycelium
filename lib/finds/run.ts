/**
 * One tick of the Finds feed for one person (the daily cron, knocked by
 * the tick): the watchers once a day, verdict jobs for what is new, the
 * cloud fallback for what has waited, and on Sunday evening the digest.
 * Every step is safe to run twice: each source records its last run, each
 * find is kept once, each job has a dedupe key, the digest reads the ledger.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { londonClock } from "@/lib/daylog/day";
import { enqueueJob } from "@/lib/jobs/queue";
import { sendDigest } from "./digest";
import { watcherFetch } from "./fixtures";
import { ensureSources, markSourceRun } from "./sources";
import { listFinds, recordFinds } from "./store";
import type { Candidate, SourceRow } from "./types";
import { cloudVerdicts, queueVerdicts } from "./verdict";
import { dependencyList, watchAdvisories } from "./watchers/advisories";
import { githubHeaders, watchGithub } from "./watchers/github";
import { watchHn } from "./watchers/hn";
import { watchFeeds } from "./watchers/rss";
import { weekStart } from "./week";

export const AUDIT_KIND = "npm_audit";

export type TickResult = { sources_run: number; found: number; new: number; queued: number; cloud_verdicts: number; digest: string; errors: string[] };

/** The dependencies the advisory watcher asks about: package.json, read once per process. */
let deps: string[] | null = null;
async function dependencies(): Promise<string[]> {
  if (deps) return deps;
  try {
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    let installed: Record<string, string> = {};
    try {
      const lock = JSON.parse(readFileSync(`${process.cwd()}/package-lock.json`, "utf8")) as { packages?: Record<string, { version?: string }> };
      for (const [p, v] of Object.entries(lock.packages ?? {})) if (p.startsWith("node_modules/") && !p.slice(13).includes("node_modules/") && v.version) installed[p.slice(13)] = v.version;
    } catch {
      installed = {};
    }
    deps = dependencyList(pkg, installed);
  } catch {
    deps = [];
  }
  return deps;
}

/** Run one source's watcher. Pure apart from the fetch. */
export async function runSource(source: SourceRow, feeds: SourceRow[], fetchImpl: typeof fetch, now: Date): Promise<{ found: Candidate[]; errors: string[] } | null> {
  switch (source.kind) {
    case "github":
      return watchGithub(fetchImpl, now);
    case "hn":
      return watchHn(fetchImpl, now);
    case "rss":
      return watchFeeds(fetchImpl, now, feeds.filter((f) => f.target).map((f) => ({ label: f.label, url: f.target as string })));
    case "advisory":
      return watchAdvisories(fetchImpl, await dependencies(), githubHeaders());
    default:
      // "audit" runs on the PC (a job); "imap" has no reader yet.
      return null;
  }
}

export async function runFindsTick(db: SupabaseClient, uid: string, now: Date = new Date(), opts: { fetchImpl?: typeof fetch; force?: boolean } = {}): Promise<TickResult> {
  const fetchImpl = opts.fetchImpl ?? watcherFetch();
  const out: TickResult = { sources_run: 0, found: 0, new: 0, queued: 0, cloud_verdicts: 0, digest: "skipped", errors: [] };
  const sources = await ensureSources(db);
  const today = londonClock(now).date;
  const enabled = sources.filter((s) => s.enabled);
  const feeds = enabled.filter((s) => s.kind === "rss");
  let feedsDone = false;
  const fresh: Candidate[] = [];

  for (const s of enabled) {
    if (s.kind === "rss" && feedsDone) continue;
    if (!opts.force && s.last_run_at && londonClock(new Date(s.last_run_at)).date === today) continue;
    if (s.kind === "audit") {
      // The PC runs `npm audit --json` in its checkout; the handler files the result (lib/finds/audit.ts). Once a week.
      const res = await enqueueJob(db, { kind: AUDIT_KIND, lane: "pc", dedupeKey: `${AUDIT_KIND}:${uid}:${weekStart(now)}`, maxAttempts: 1, payload: {} });
      await markSourceRun(db, s.id, now, { queued: !res.duplicate });
      out.sources_run += 1;
      continue;
    }
    let result: { found: Candidate[]; errors: string[] } | null = null;
    try {
      result = await runSource(s, feeds, fetchImpl, now);
    } catch (err) {
      result = { found: [], errors: [err instanceof Error ? err.message : String(err)] };
    }
    if (!result) continue;
    out.sources_run += 1;
    out.found += result.found.length;
    out.errors.push(...result.errors);
    fresh.push(...result.found);
    const stamp = { found: result.found.length, errors: result.errors.slice(0, 5) };
    if (s.kind === "rss") {
      feedsDone = true;
      for (const f of feeds) await markSourceRun(db, f.id, now, stamp);
    } else await markSourceRun(db, s.id, now, stamp);
  }

  if (fresh.length) {
    const { inserted } = await recordFinds(db, fresh, { now });
    out.new = inserted.length;
    out.queued = await queueVerdicts(db, inserted);
  }
  try {
    out.cloud_verdicts = await cloudVerdicts(db, now);
  } catch (err) {
    out.errors.push(`cloud verdicts: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    out.digest = await sendDigest(db, uid, await listFinds(db, { now, days: 7 }), now);
  } catch (err) {
    out.digest = "error";
    out.errors.push(`digest: ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}
