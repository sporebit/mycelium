/**
 * Day log close, steps 2–3 (spec §4.4): scenes become rows (structural, no
 * review); everything that touches People, Places or the facts table is
 * queued in pending_entities for review (decision 17); quotes go into the
 * Quotes pipeline as an ordinary quote capture. Idempotent by item key, so
 * a re-extract only ever adds what is new and never rewrites a row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSpeaker } from "@/lib/quotes/server";
import { knownPeople } from "./extract";
import { namesIn, pendingItems, sceneLines, type Extraction } from "./extraction";

export const DAYLOG_PENDING_TYPES = ["daylog_person_link", "daylog_new_person", "daylog_fact", "daylog_place"] as const;
export type DaylogPendingType = (typeof DAYLOG_PENDING_TYPES)[number];
export function isDaylogPending(t: string): t is DaylogPendingType {
  return (DAYLOG_PENDING_TYPES as readonly string[]).includes(t);
}

type SceneRow = { id: string; position: number; title: string; place_id: string | null; narrative: string | null; narrative_edited_by_user: boolean };

const lower = (s: string) => s.trim().toLowerCase();

export type MaterialiseResult = { extraction: Extraction; scenes: number; queued: number; quotes: number };

export async function materialise(db: SupabaseClient, day: { id: string; day: string; summary: string | null }, ex: Extraction): Promise<MaterialiseResult> {
  // -- scenes ---------------------------------------------------------------
  const { data: existingRows, error: readErr } = await db.from("daylog_scenes").select("id, position, title, place_id, narrative, narrative_edited_by_user").eq("day_id", day.id).order("position");
  // never queue review items against scenes we could not read: they would all lose their scene
  if (readErr) throw new Error(`daylog_scenes read failed: ${readErr.message}`);
  const existing = (existingRows ?? []) as SceneRow[];
  const sceneIds: Record<string, string> = { ...(ex.scene_ids ?? {}) };
  // a row that went away (deleted on the day page) must not be resurrected or linked to
  for (const [ref, id] of Object.entries(sceneIds)) if (!existing.some((r) => r.id === id)) delete sceneIds[ref];
  const hadScenes = Object.keys(ex.scene_ids ?? {}).length > 0;

  const lines = sceneLines(day.summary);
  const useLines = lines.length === ex.scenes.length;
  const linkedPlaces = new Set<string>();
  let position = existing.reduce((m, r) => Math.max(m, r.position), -1) + 1;
  let inserted = 0;

  for (let i = 0; i < ex.scenes.length; i++) {
    const s = ex.scenes[i];
    let placeId: string | null = null;
    if (s.place_text) {
      const { data: places } = await db.from("places").select("id").ilike("name", s.place_text.replace(/[%_]/g, " ")).limit(2);
      if ((places ?? []).length === 1) placeId = (places![0] as { id: string }).id;
    }
    if (placeId) linkedPlaces.add(s.ref);

    const known = sceneIds[s.ref] ? existing.find((r) => r.id === sceneIds[s.ref]) : existing.find((r) => lower(r.title) === lower(s.title));
    if (known) {
      sceneIds[s.ref] = known.id;
      if (known.place_id) linkedPlaces.add(s.ref);
      continue; // rows are never rewritten by extraction (decision 25)
    }
    if (hadScenes && ex.scene_ids && s.ref in ex.scene_ids) continue; // was materialised once, then deleted by hand
    const { data: row, error } = await db
      .from("daylog_scenes")
      .insert({ day_id: day.id, position: position++, title: s.title, place_id: placeId, place_text: s.place_text, time_hint: s.time_hint, narrative: useLines ? lines[i] : null })
      .select("id")
      .single();
    if (error || !row) {
      console.error("[daylog] scene insert failed:", error?.message);
      continue;
    }
    sceneIds[s.ref] = (row as { id: string }).id;
    inserted++;
  }

  // -- pending entities -----------------------------------------------------
  const known = await knownPeople(db, namesIn(ex));
  const items = pendingItems(ex, known, linkedPlaces);
  const { data: queuedRows } = await db.from("pending_entities").select("additional_data").eq("additional_data->>day_id", day.id);
  const already = new Set(((queuedRows ?? []) as Array<{ additional_data: { key?: string } | null }>).map((r) => r.additional_data?.key).filter(Boolean) as string[]);
  const idsFor = (refs: string[]) => refs.map((r) => sceneIds[r]).filter(Boolean);
  const sceneTitle = (ref: string | null) => (ref ? (ex.scenes.find((s) => s.ref === ref)?.title ?? null) : null);

  const rows: Array<Record<string, unknown>> = [];
  for (const it of items) {
    if (already.has(it.key)) continue;
    const base = { day_id: day.id, day: day.day, key: it.key };
    if (it.type === "daylog_person_link") {
      rows.push({ entity_type: it.type, entity_name: it.name, additional_data: { ...base, person_id: it.person_id, scene_ids: idsFor(it.scene_refs), scenes: it.scene_refs.map(sceneTitle).filter(Boolean) } });
    } else if (it.type === "daylog_new_person") {
      rows.push({ entity_type: it.type, entity_name: it.name, additional_data: { ...base, note: it.note, scene_ids: idsFor(it.scene_refs), scenes: it.scene_refs.map(sceneTitle).filter(Boolean) } });
    } else if (it.type === "daylog_place") {
      rows.push({ entity_type: it.type, entity_name: it.name, additional_data: { ...base, scene_id: sceneIds[it.scene_ref] ?? null, scene: sceneTitle(it.scene_ref) } });
    } else {
      const f = it.fact;
      rows.push({
        entity_type: it.type,
        entity_name: f.text.slice(0, 200),
        additional_data: { ...base, scene_id: f.scene_ref ? (sceneIds[f.scene_ref] ?? null) : null, scene: sceneTitle(f.scene_ref), kind: f.kind, subject: f.subject, subject_person_id: f.subject ? (known.get(f.subject.toLowerCase()) ?? null) : null, text: f.text, data: f.data, confidence: f.confidence },
      });
    }
  }
  let queued = 0;
  if (rows.length) {
    const { error } = await db.from("pending_entities").insert(rows);
    if (error) console.error("[daylog] pending insert failed:", error.message);
    else queued = rows.length;
  }

  // -- quotes → the Quotes pipeline, unchanged (a quote capture awaiting review) ----
  let quotes = 0;
  if (ex.quotes.length) {
    const { data: prior } = await db.from("raw_captures").select("classification").eq("source", "daylog").eq("classification->>daylog_day_id", day.id);
    const seen = new Set(((prior ?? []) as Array<{ classification: { title?: string } | null }>).map((r) => lower(r.classification?.title ?? "")));
    for (const q of ex.quotes) {
      if (seen.has(lower(q.text))) continue;
      const resolved = await resolveSpeaker(db, q.speaker);
      const { error } = await db.from("raw_captures").insert({
        source: "daylog",
        raw_text: q.speaker ? `${q.speaker} said: "${q.text}"` : `"${q.text}"`,
        llm_source: "daylog",
        classification: {
          kind: "quote",
          title: q.text,
          confidence: "low",
          urgency: "someday",
          daylog_day_id: day.id,
          quote: { text: q.text, speaker: q.speaker, is_own: !q.speaker, speaker_confidence: "certain", context: `Day log ${day.day}`, said_at_relative: null, source: null, likely_original: true },
          quote_person_id: resolved.person_id,
          quote_person_candidates: resolved.candidates,
        },
      });
      if (error) console.error("[daylog] quote hand-off failed:", error.message);
      else quotes++;
    }
  }

  return { extraction: { ...ex, scene_ids: sceneIds }, scenes: inserted, queued, quotes };
}

/** Unresolved review items for a day (the badge on the day page and the close reply). */
export async function pendingCount(db: SupabaseClient, dayId: string): Promise<number> {
  const { count } = await db.from("pending_entities").select("id", { count: "exact", head: true }).eq("additional_data->>day_id", dayId).is("resolved_at", null);
  return count ?? 0;
}
