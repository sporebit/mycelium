/**
 * Day log review approvals (spec §4.4 step 3, decision 17). Nothing reaches
 * People, Places or daylog_facts until one of these runs. Called from the
 * pending-entities resolve route with the caller's RLS-scoped client.
 *
 *   create_new     approve as proposed (link the matched person / create the
 *                  person or place / record the fact)
 *   link_existing  approve against a different row the reviewer picked
 *   reject         handled by the route: the item is closed, nothing is written
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseAlias } from "@/lib/people/normalise";
import { resolveSpeaker } from "@/lib/quotes/server";
import { FACT_KINDS } from "./extraction";
import type { DaylogPendingType } from "./materialise";

export type DaylogPendingRow = { id: string; entity_type: DaylogPendingType; entity_name: string; additional_data: Record<string, unknown> | null };
export type ApproveInput = { action: "create_new" | "link_existing"; link_to_id?: string; text?: string; kind?: string };
export type ApproveResult = { ok: true; resolved_entity_id: string | null } | { ok: false; status: number; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => (typeof v === "string" && UUID_RE.test(v) ? v : null);

async function liveScenes(db: SupabaseClient, ids: unknown): Promise<string[]> {
  const wanted = (Array.isArray(ids) ? ids : [ids]).map(uuid).filter((v): v is string => !!v);
  if (!wanted.length) return [];
  const { data } = await db.from("daylog_scenes").select("id").in("id", wanted);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

async function joinScenes(db: SupabaseClient, sceneIds: string[], personId: string): Promise<void> {
  if (!sceneIds.length) return;
  const { error } = await db.from("daylog_scene_people").upsert(sceneIds.map((scene_id) => ({ scene_id, person_id: personId })), { onConflict: "scene_id,person_id", ignoreDuplicates: true });
  if (error) throw new Error(`scene people: ${error.message}`);
}

/** Facts approved before their subject existed carry the name; claim them now. */
async function claimFacts(db: SupabaseClient, dayId: string | null, name: string, personId: string): Promise<void> {
  if (!dayId) return;
  await db.from("daylog_facts").update({ subject_person_id: personId, updated_at: new Date().toISOString() }).eq("day_id", dayId).is("subject_person_id", null).ilike("data->>subject_name", name.replace(/[%_]/g, " "));
}

export async function approveDaylogPending(db: SupabaseClient, row: DaylogPendingRow, input: ApproveInput): Promise<ApproveResult> {
  const ad = row.additional_data ?? {};
  const dayId = uuid(ad.day_id);
  const picked = uuid(input.link_to_id);
  if (input.action === "link_existing" && !picked) return { ok: false, status: 400, error: "link_to_id required" };

  try {
    if (row.entity_type === "daylog_person_link" || row.entity_type === "daylog_new_person") {
      let personId = input.action === "link_existing" ? picked : uuid(ad.person_id);
      if (!personId && row.entity_type === "daylog_person_link") return { ok: false, status: 400, error: "no matched person — pick one" };
      if (!personId) {
        const note = typeof ad.note === "string" && ad.note.trim() ? ad.note.trim() : null;
        const { data: created, error } = await db.from("people").insert({ first_name: row.entity_name, notes: note, needs_review: false }).select("id").single();
        if (error || !created) return { ok: false, status: 500, error: error?.message ?? "person create failed" };
        personId = (created as { id: string }).id;
        await db.from("people_aliases").insert({ person_id: personId, alias: normaliseAlias(row.entity_name) ?? row.entity_name, is_primary: true });
      } else if (input.action === "link_existing") {
        // the spelling said tonight becomes an alias, so the next night matches on its own
        const alias = normaliseAlias(row.entity_name);
        if (alias) await db.from("people_aliases").upsert({ person_id: personId, alias, is_primary: false }, { onConflict: "person_id,alias" });
      }
      await joinScenes(db, await liveScenes(db, ad.scene_ids), personId);
      await claimFacts(db, dayId, row.entity_name, personId);
      return { ok: true, resolved_entity_id: personId };
    }

    if (row.entity_type === "daylog_fact") {
      if (!dayId) return { ok: false, status: 400, error: "fact has no day" };
      const text = (typeof input.text === "string" && input.text.trim()) || (typeof ad.text === "string" && ad.text.trim()) || row.entity_name;
      const kindRaw = typeof input.kind === "string" ? input.kind : String(ad.kind ?? "other");
      const kind = (FACT_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "other";
      const subjectName = typeof ad.subject === "string" && ad.subject.trim() ? ad.subject.trim() : null;
      // the subject may have been created since this item was queued
      const subjectId = picked ?? uuid(ad.subject_person_id) ?? (subjectName ? (await resolveSpeaker(db, subjectName)).person_id : null);
      const [sceneId] = await liveScenes(db, ad.scene_id);
      const data = { ...((ad.data as Record<string, unknown> | null) ?? {}), ...(subjectName ? { subject_name: subjectName } : {}) };
      const { data: fact, error } = await db
        .from("daylog_facts")
        .insert({ day_id: dayId, scene_id: sceneId ?? null, kind, subject_person_id: subjectId, text, data: Object.keys(data).length ? data : null, confidence: ad.confidence === "inferred" ? "inferred" : "stated", edited_by_user: typeof input.text === "string" && input.text.trim() !== (ad.text ?? "") })
        .select("id")
        .single();
      if (error || !fact) return { ok: false, status: 500, error: error?.message ?? "fact insert failed" };
      return { ok: true, resolved_entity_id: (fact as { id: string }).id };
    }

    if (row.entity_type === "daylog_place") {
      let placeId = input.action === "link_existing" ? picked : null;
      if (!placeId) {
        const { data: place, error } = await db
          .from("places")
          .insert({ name: row.entity_name, category: "place", status: "visited", visit_date: typeof ad.day === "string" ? ad.day : null, tags: [] })
          .select("id")
          .single();
        if (error || !place) return { ok: false, status: 500, error: error?.message ?? "place create failed" };
        placeId = (place as { id: string }).id;
      }
      const [sceneId] = await liveScenes(db, ad.scene_id);
      if (sceneId) await db.from("daylog_scenes").update({ place_id: placeId, updated_at: new Date().toISOString() }).eq("id", sceneId);
      // the same place said in other scenes of the day links too
      if (dayId) await db.from("daylog_scenes").update({ place_id: placeId, updated_at: new Date().toISOString() }).eq("day_id", dayId).is("place_id", null).ilike("place_text", row.entity_name.replace(/[%_]/g, " "));
      return { ok: true, resolved_entity_id: placeId };
    }
    return { ok: false, status: 400, error: "unknown kind" };
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "approve failed" };
  }
}
