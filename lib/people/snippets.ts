/**
 * The source text behind a people mention — the capture's words, the
 * ticket's title, the journal day's summary — keyed `${source_type}:${source_id}`.
 * Shared by the review queue and the People list's Review Needed cards
 * (people-review R6).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type MentionRef = { source_type: string; source_id: string };

export async function mentionSnippets(db: SupabaseClient, mentions: MentionRef[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = (type: string) => Array.from(new Set(mentions.filter((m) => m.source_type === type).map((m) => m.source_id)));
  const captureIds = ids("capture");
  const taskIds = ids("task");
  const journalIds = ids("journal");
  await Promise.all([
    (async () => {
      if (!captureIds.length) return;
      const { data } = await db.from("raw_captures").select("id, raw_text").in("id", captureIds);
      for (const r of (data ?? []) as Array<{ id: string; raw_text: string | null }>) out.set(`capture:${r.id}`, r.raw_text);
    })(),
    (async () => {
      if (!taskIds.length) return;
      const { data } = await db.from("tickets").select("id, key, title").in("id", taskIds);
      for (const r of (data ?? []) as Array<{ id: string; key: string | null; title: string }>) out.set(`task:${r.id}`, r.key ? `${r.key} — ${r.title}` : r.title);
    })(),
    (async () => {
      if (!journalIds.length) return;
      const [{ data: legacy }, { data: days }] = await Promise.all([
        db.from("journal_entries").select("id, raw_text").in("id", journalIds),
        db.from("daylog_days").select("id, summary, transcript").in("id", journalIds),
      ]);
      for (const r of (legacy ?? []) as Array<{ id: string; raw_text: string | null }>) out.set(`journal:${r.id}`, r.raw_text);
      for (const r of (days ?? []) as Array<{ id: string; summary: string | null; transcript: Array<{ role: string; text: string }> | null }>) {
        out.set(`journal:${r.id}`, r.summary ?? (r.transcript ?? []).find((e) => e.role === "user")?.text ?? null);
      }
    })(),
  ]);
  return out;
}
