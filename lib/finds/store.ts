/**
 * Finds in the database (0178): recorded once each (the normalised URL is
 * the key), read by week, answered Keep or Skip, exported in the shape of
 * the resources record (claude/design-resources.md).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Candidate, type FindRow, SOURCE_LABEL, type Verdict, VERDICT_LABEL } from "./types";
import { normaliseUrl } from "./url";

export const FIND_COLS = "id, url, title, source, source_ref, kind, found_at, raw, verdict, verdict_by, verdicted_at, answer, answered_at, capture_id";

/** One entry per URL, the first mention kept; a candidate whose URL will not normalise is dropped. Pure. */
export function dedupe(candidates: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    const url = normaliseUrl(c.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ ...c, url, title: c.title.replace(/\s+/g, " ").trim().slice(0, 300) || url });
  }
  return out;
}

/**
 * Write the candidates not already kept. Returns the new rows. A URL kept
 * before (by any source, any week) is left as it was: a find is recorded
 * once, with the source that saw it first.
 */
export async function recordFinds(db: SupabaseClient, candidates: readonly Candidate[], opts: { now?: Date; captureId?: string | null } = {}): Promise<{ inserted: FindRow[]; known: number }> {
  const fresh = dedupe(candidates);
  if (!fresh.length) return { inserted: [], known: 0 };
  const known = new Set<string>();
  for (let i = 0; i < fresh.length; i += 100) {
    const { data, error } = await db.from("finds").select("url").in("url", fresh.slice(i, i + 100).map((c) => c.url));
    if (error) throw new Error(`finds read: ${error.message}`);
    for (const r of (data ?? []) as Array<{ url: string }>) known.add(r.url);
  }
  const rows = fresh
    .filter((c) => !known.has(c.url))
    .map((c) => ({
      url: c.url,
      title: c.title,
      source: c.source,
      source_ref: c.source_ref,
      kind: c.kind,
      raw: c.raw,
      found_at: (opts.now ?? new Date()).toISOString(),
      capture_id: opts.captureId ?? null,
    }));
  if (!rows.length) return { inserted: [], known: known.size };
  const inserted: FindRow[] = [];
  // One at a time so a race on one URL (23505) loses that row and nothing else.
  for (const row of rows) {
    const { data, error } = await db.from("finds").insert(row).select(FIND_COLS).single();
    if (error) {
      if (error.code === "23505") {
        known.add(row.url);
        continue;
      }
      throw new Error(`finds insert: ${error.message}`);
    }
    inserted.push(data as FindRow);
  }
  return { inserted, known: known.size };
}

/** The finds of the last `days` days, newest first. */
export async function listFinds(db: SupabaseClient, opts: { now?: Date; days?: number; limit?: number } = {}): Promise<FindRow[]> {
  const since = new Date((opts.now ?? new Date()).getTime() - (opts.days ?? 7) * 86_400_000).toISOString();
  const { data, error } = await db.from("finds").select(FIND_COLS).gte("found_at", since).order("found_at", { ascending: false }).limit(opts.limit ?? 300);
  if (error) throw new Error(`finds list: ${error.message}`);
  return (data ?? []) as FindRow[];
}

export async function getFind(db: SupabaseClient, id: string): Promise<FindRow | null> {
  const { data } = await db.from("finds").select(FIND_COLS).eq("id", id).maybeSingle();
  return (data as FindRow | null) ?? null;
}

/** Finds with no verdict yet, oldest first. */
export async function unverdicted(db: SupabaseClient, limit = 20): Promise<FindRow[]> {
  const { data, error } = await db.from("finds").select(FIND_COLS).is("verdict", null).order("found_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`finds unverdicted: ${error.message}`);
  return (data ?? []) as FindRow[];
}

export async function saveVerdict(db: SupabaseClient, id: string, verdict: Verdict, by: "pc" | "cloud", now: Date = new Date()): Promise<boolean> {
  const { data, error } = await db.from("finds").update({ verdict, verdict_by: by, verdicted_at: now.toISOString() }).eq("id", id).is("verdict", null).select("id");
  if (error) throw new Error(`finds verdict: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Keep what a watcher saw plus what opening the page gave (its text), for the verdict and the page. */
export async function mergeRaw(db: SupabaseClient, id: string, extra: Record<string, unknown>): Promise<void> {
  const row = await getFind(db, id);
  if (!row) return;
  await db.from("finds").update({ raw: { ...row.raw, ...extra } }).eq("id", id);
}

export async function answerFind(db: SupabaseClient, id: string, answer: "keep" | "skip" | null, now: Date = new Date()): Promise<FindRow | null> {
  const { data, error } = await db
    .from("finds")
    .update({ answer, answered_at: answer ? now.toISOString() : null })
    .eq("id", id)
    .select(FIND_COLS)
    .maybeSingle();
  if (error) throw new Error(`finds answer: ${error.message}`);
  return (data as FindRow | null) ?? null;
}

export async function deleteFind(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from("finds").delete().eq("id", id);
  if (error) throw new Error(`finds delete: ${error.message}`);
}

const cell = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim() || "—";

/**
 * The week as a Markdown record in the shape of claude/design-resources.md:
 * what it does, cost, verdict, where else it could help, cautions, whether
 * it was opened; then the three verdict lists. Pure.
 */
export function exportMarkdown(rows: readonly FindRow[], opts: { now?: Date; days?: number } = {}): string {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.days ?? 7) * 86_400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const lines: string[] = [
    `# Finds — ${day(since)} to ${day(now)}`,
    "",
    `*${rows.length} find${rows.length === 1 ? "" : "s"}, ${rows.filter((r) => r.verdict).length} with a verdict, ${rows.filter((r) => r.raw && typeof r.raw.text === "string").length} opened. Nothing was installed.*`,
    "",
    "| Find | Source | What it does | Cost | Licence | Verdict | Could also help | Cautions | Opened | Answer |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const v = r.verdict;
    lines.push(
      `| [${cell(r.title)}](${r.url}) | ${cell(SOURCE_LABEL[r.source])}${r.source_ref ? ` (${cell(r.source_ref)})` : ""} | ${cell(v?.what ?? v?.summary)} | ${cell(v?.cost)} | ${cell(v?.licence)} | ${v ? VERDICT_LABEL[v.verdict] : "—"} | ${cell(v?.suits.join(", "))} | ${cell(v?.cautions)} | ${r.raw && typeof r.raw.text === "string" ? "yes" : "no"} | ${r.answer ?? "—"} |`,
    );
  }
  const by = (call: Verdict["verdict"]) => rows.filter((r) => r.verdict?.verdict === call);
  for (const [call, heading] of [
    ["use_now", "Use now (free)"],
    ["maybe_later", "Maybe later"],
    ["skip", "Skip"],
  ] as const) {
    const list = by(call);
    if (!list.length) continue;
    lines.push("", `## ${heading}`, "");
    for (const r of list) lines.push(`- **${cell(r.title)}** — ${cell(r.verdict?.summary)}${r.verdict?.suits.length ? ` *(${r.verdict.suits.join(", ")})*` : ""}`);
  }
  lines.push("", "## Install advice", "", "Nothing here was installed. Read each page, and any skill's SKILL.md and hooks, before installing; pin to a commit; never during an unattended run.", "");
  return lines.join("\n");
}
