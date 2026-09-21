import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { buildPersonDays, type PersonFactIn, type PersonSceneIn } from "@/lib/daylog/person";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SceneDb = { id: string; day_id: string; position: number; title: string; place_id: string | null; place_text: string | null; narrative: string | null; space_id?: string | null };
type FactDb = { id: string; day_id: string; scene_id: string | null; kind: string; subject_person_id: string | null; text: string; data: Record<string, unknown> | null };
const FACT_COLS = "id, day_id, scene_id, kind, subject_person_id, text, data";

/**
 * GET /api/people/:id/days — the Days tab (daylog spec §5, §6, decision 19):
 * stats from the people_daylog_stats view, the scene timeline, facts and
 * preferences on their record, places and food together, milestones. Only
 * reviewed rows exist in these tables, so nothing unapproved can show.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const [{ data: statRow }, { data: linkRows, error: linkErr }] = await Promise.all([
      supabase.from("people_daylog_stats").select("days_together, first_seen, last_seen").eq("person_id", id).maybeSingle(),
      supabase.from("daylog_scene_people").select("scene_id").eq("person_id", id).limit(2000),
    ]);
    if (linkErr) throw linkErr;
    const sceneIds = ((linkRows ?? []) as Array<{ scene_id: string }>).map((r) => r.scene_id);

    const [{ data: sceneRows }, { data: sceneFacts }, { data: subjectFacts }] = await Promise.all([
      sceneIds.length ? supabase.from("daylog_scenes").select("id, day_id, position, title, place_id, place_text, narrative, space_id").in("id", sceneIds) : Promise.resolve({ data: [] }),
      sceneIds.length ? supabase.from("daylog_facts").select(FACT_COLS).in("scene_id", sceneIds) : Promise.resolve({ data: [] }),
      supabase.from("daylog_facts").select(FACT_COLS).eq("subject_person_id", id),
    ]);
    const scenesDb = (sceneRows ?? []) as SceneDb[];
    auditListRead(req, scenesDb, "journal", "daylog");
    const factsDb = Array.from(new Map([...((sceneFacts ?? []) as FactDb[]), ...((subjectFacts ?? []) as FactDb[])].map((f) => [f.id, f])).values());

    const dayIds = Array.from(new Set([...scenesDb.map((s) => s.day_id), ...factsDb.map((f) => f.day_id)]));
    const placeIds = Array.from(new Set(scenesDb.map((s) => s.place_id).filter((v): v is string => !!v)));
    const [{ data: dayRows }, { data: placeRows }] = await Promise.all([
      dayIds.length ? supabase.from("daylog_days").select("id, day").in("id", dayIds) : Promise.resolve({ data: [] }),
      placeIds.length ? supabase.from("places").select("id, name").in("id", placeIds) : Promise.resolve({ data: [] }),
    ]);
    const dayOf = new Map(((dayRows ?? []) as Array<{ id: string; day: string }>).map((d) => [d.id, d.day]));
    const placeName = new Map(((placeRows ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));

    // a scene or fact whose day the caller cannot read is dropped rather than shown undated
    const scenes: PersonSceneIn[] = scenesDb.flatMap((s) => {
      const day = dayOf.get(s.day_id);
      return day ? [{ id: s.id, day, position: s.position, title: s.title, place_id: s.place_id, place_text: s.place_text, place_name: s.place_id ? (placeName.get(s.place_id) ?? null) : null, narrative: s.narrative }] : [];
    });
    const facts: PersonFactIn[] = factsDb.flatMap((f) => {
      const day = dayOf.get(f.day_id);
      return day ? [{ id: f.id, day, scene_id: f.scene_id, kind: f.kind, subject_person_id: f.subject_person_id, text: f.text, data: f.data }] : [];
    });

    const stats = (statRow as { days_together: number; first_seen: string; last_seen: string } | null) ?? { days_together: 0, first_seen: null, last_seen: null };
    return NextResponse.json({ stats, ...buildPersonDays(id, scenes, facts) });
  } catch (err) {
    console.error("[/api/people/:id/days GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
