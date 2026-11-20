/**
 * Where finds come from, per person (find_sources, 0178). Seeded once with
 * the defaults; the page switches each on or off and adds feeds. The IMAP
 * newsletter inbox is a named source with no reader yet: the mailbox and
 * its password are Phil's (MYC-201), so it stays off until he fills it in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceKind, SourceRow } from "./types";
import { DEFAULT_FEEDS } from "./watchers/rss";

export type SourceSeed = { kind: SourceKind; label: string; target: string | null; enabled: boolean };

export const DEFAULT_SOURCES: SourceSeed[] = [
  { kind: "github", label: "GitHub: MCP servers, agent skills, AI agents, design tools", target: null, enabled: true },
  { kind: "hn", label: "Hacker News: Claude Code, MCP, agents, design", target: null, enabled: true },
  ...DEFAULT_FEEDS.map((f) => ({ kind: "rss" as const, label: f.label, target: f.url, enabled: true })),
  { kind: "advisory", label: "GitHub Advisory Database for package.json", target: null, enabled: true },
  { kind: "audit", label: "npm audit on the PC", target: null, enabled: true },
  { kind: "imap", label: "Newsletter inbox (IMAP; Phil's mailbox, MYC-201)", target: null, enabled: false },
];

const COLS = "id, kind, label, target, enabled, last_run_at, last_result";

/** The person's sources, seeding the defaults they do not have yet. Idempotent. */
export async function ensureSources(db: SupabaseClient, seeds = DEFAULT_SOURCES): Promise<SourceRow[]> {
  const { data, error } = await db.from("find_sources").select(COLS).order("kind").order("label");
  if (error) throw new Error(`find_sources: ${error.message}`);
  const have = new Set(((data ?? []) as SourceRow[]).map((r) => `${r.kind}|${r.target ?? ""}`));
  const missing = seeds.filter((s) => !have.has(`${s.kind}|${s.target ?? ""}`));
  if (!missing.length) return (data ?? []) as SourceRow[];
  const { error: insErr } = await db.from("find_sources").insert(missing);
  // 23505: another run seeded the same row between our read and write. Fine.
  if (insErr && insErr.code !== "23505") throw new Error(`find_sources seed: ${insErr.message}`);
  const again = await db.from("find_sources").select(COLS).order("kind").order("label");
  if (again.error) throw new Error(`find_sources: ${again.error.message}`);
  return (again.data ?? []) as SourceRow[];
}

export async function setSource(db: SupabaseClient, id: string, patch: { enabled?: boolean; label?: string }): Promise<void> {
  const { error } = await db.from("find_sources").update(patch).eq("id", id);
  if (error) throw new Error(`find_sources update: ${error.message}`);
}

/** Add a feed by URL. Returns the row, or the existing one for the same URL. */
export async function addFeed(db: SupabaseClient, url: string, label?: string): Promise<SourceRow> {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new Error("That is not a web address.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("A feed address starts with https://");
  const target = u.toString();
  const { data, error } = await db
    .from("find_sources")
    .insert({ kind: "rss", label: (label ?? "").trim() || u.hostname.replace(/^www\./, ""), target, enabled: true })
    .select(COLS)
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: had } = await db.from("find_sources").select(COLS).eq("kind", "rss").eq("target", target).single();
      return had as SourceRow;
    }
    throw new Error(`find_sources insert: ${error.message}`);
  }
  return data as SourceRow;
}

export async function removeSource(db: SupabaseClient, id: string): Promise<void> {
  // Only a feed can be removed; the built-in kinds are switched off instead.
  const { error } = await db.from("find_sources").delete().eq("id", id).eq("kind", "rss");
  if (error) throw new Error(`find_sources delete: ${error.message}`);
}

export async function markSourceRun(db: SupabaseClient, id: string, now: Date, result: Record<string, unknown>): Promise<void> {
  await db.from("find_sources").update({ last_run_at: now.toISOString(), last_result: result }).eq("id", id);
}
