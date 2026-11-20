/**
 * The Finds feed (master run §12): posts, repos, skills, tools, articles
 * and advisories worth a look, shared in or found by a watcher, each
 * opened, summarised and given a verdict, answered Keep or Skip in the
 * weekly review. Nothing is ever installed by the app.
 */

export type FindSource = "share" | "github" | "hn" | "rss" | "advisory" | "audit" | "manual";
export type FindKind = "repo" | "post" | "skill" | "tool" | "article" | "advisory" | "other";
export type VerdictCall = "use_now" | "maybe_later" | "skip";

/** What a watcher hands in: enough to keep the find and to ask for a verdict later. */
export type Candidate = {
  url: string;
  title: string;
  source: FindSource;
  source_ref: string | null;
  kind: FindKind;
  /** What the watcher saw: stars, points, a snippet, the feed's own summary. Small. */
  raw: Record<string, unknown>;
};

/** The model's verdict, in the shape of the resources record (claude/design-resources.md). */
export type Verdict = {
  what: string;
  cost: string;
  licence: string;
  cautions: string;
  verdict: VerdictCall;
  /** Which of Phil's projects it suits: Mycelium, the AI website agency, StreetGuesser, … */
  suits: string[];
  summary: string;
};

export type FindRow = {
  id: string;
  url: string;
  title: string;
  source: FindSource;
  source_ref: string | null;
  kind: FindKind;
  found_at: string;
  raw: Record<string, unknown>;
  verdict: Verdict | null;
  verdict_by: "pc" | "cloud" | null;
  verdicted_at: string | null;
  answer: "keep" | "skip" | null;
  answered_at: string | null;
  capture_id: string | null;
};

export type SourceKind = "github" | "hn" | "rss" | "advisory" | "audit" | "imap";

export type SourceRow = {
  id: string;
  kind: SourceKind;
  label: string;
  target: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_result: Record<string, unknown> | null;
};

export const VERDICT_LABEL: Record<VerdictCall, string> = { use_now: "Use now", maybe_later: "Maybe later", skip: "Skip" };
export const SOURCE_LABEL: Record<FindSource, string> = { share: "shared", github: "GitHub", hn: "Hacker News", rss: "feed", advisory: "advisory", audit: "npm audit", manual: "added" };
