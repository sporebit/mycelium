/**
 * Day log read model for the day page (spec §5 GET, §6): scenes in order,
 * each with its approved people and facts; day-level facts; the pending
 * review count. Only approved rows live in these tables (decision 17).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { pendingCount } from "./materialise";
import { dayMedia, type SignedMedia } from "./media";

export const SCENE_SELECT = "id, day_id, position, title, place_id, place_text, time_hint, narrative, narrative_edited_by_user, hidden_from_linked";
export const FACT_SELECT = "id, day_id, scene_id, kind, subject_person_id, text, data, confidence, edited_by_user";

export type ScenePerson = { id: string; name: string };
export type FactRow = { id: string; day_id: string; scene_id: string | null; kind: string; subject_person_id: string | null; subject_name: string | null; text: string; data: Record<string, unknown> | null; confidence: "stated" | "inferred"; edited_by_user: boolean };
export type SceneRow = {
  id: string;
  day_id: string;
  position: number;
  title: string;
  place_id: string | null;
  place_text: string | null;
  place_name: string | null;
  time_hint: string | null;
  narrative: string | null;
  narrative_edited_by_user: boolean;
  hidden_from_linked: boolean;
  people: ScenePerson[];
  facts: FactRow[];
};
export type DayDetail = { scenes: SceneRow[]; facts: FactRow[]; pending: number; media: SignedMedia[] };

type PersonLite = { id: string; display_name: string | null; first_name: string | null; last_name: string | null };
const personName = (p: PersonLite): string => p.display_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || "someone");

export async function dayDetail(db: SupabaseClient, dayId: string): Promise<DayDetail> {
  const [{ data: sceneRows }, { data: factRows }, pending, media] = await Promise.all([
    db.from("daylog_scenes").select(SCENE_SELECT).eq("day_id", dayId).order("position"),
    db.from("daylog_facts").select(FACT_SELECT).eq("day_id", dayId).order("created_at"),
    pendingCount(db, dayId),
    dayMedia(db, dayId),
  ]);
  const scenes = (sceneRows ?? []) as Array<Omit<SceneRow, "people" | "facts" | "place_name">>;
  const rawFacts = (factRows ?? []) as Array<Omit<FactRow, "subject_name">>;

  const sceneIds = scenes.map((s) => s.id);
  const { data: links } = sceneIds.length ? await db.from("daylog_scene_people").select("scene_id, person_id").in("scene_id", sceneIds) : { data: [] };
  const linkRows = (links ?? []) as Array<{ scene_id: string; person_id: string }>;

  const personIds = Array.from(new Set([...linkRows.map((l) => l.person_id), ...rawFacts.map((f) => f.subject_person_id).filter((v): v is string => !!v)]));
  const { data: peopleRows } = personIds.length ? await db.from("people").select("id, display_name, first_name, last_name").in("id", personIds) : { data: [] };
  const names = new Map(((peopleRows ?? []) as PersonLite[]).map((p) => [p.id, personName(p)]));

  const placeIds = Array.from(new Set(scenes.map((s) => s.place_id).filter((v): v is string => !!v)));
  const { data: placeRows } = placeIds.length ? await db.from("places").select("id, name").in("id", placeIds) : { data: [] };
  const places = new Map(((placeRows ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));

  const facts: FactRow[] = rawFacts.map((f) => ({
    ...f,
    subject_name: f.subject_person_id ? (names.get(f.subject_person_id) ?? null) : typeof f.data?.subject_name === "string" ? (f.data.subject_name as string) : null,
  }));
  return {
    scenes: scenes.map((s) => ({
      ...s,
      place_name: s.place_id ? (places.get(s.place_id) ?? null) : null,
      people: linkRows.filter((l) => l.scene_id === s.id).map((l) => ({ id: l.person_id, name: names.get(l.person_id) ?? "someone" })),
      facts: facts.filter((f) => f.scene_id === s.id),
    })),
    facts: facts.filter((f) => !f.scene_id || !sceneIds.includes(f.scene_id)),
    pending,
    media,
  };
}
