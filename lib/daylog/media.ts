/**
 * Day log photos (spec §3 daylog_media, decision 28): a private bucket
 * (0132), paths `<day id>/<ts>-<rand>.<ext>`, signed URLs minted per read.
 * Attachment to a scene is by timing, never by vision: at close, each photo
 * goes to the scene whose transcript span covers the moment it arrived.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const DAYLOG_BUCKET = "daylog";
export const DAYLOG_SIGNED_TTL = 3600;
export const MEDIA_SELECT = "id, day_id, scene_id, storage_path, taken_at, caption, shareable, created_at";

export type MediaRow = { id: string; day_id: string; scene_id: string | null; storage_path: string; taken_at: string | null; caption: string | null; shareable: boolean; created_at: string };
export type SignedMedia = MediaRow & { url: string | null };

function extensionFor(mediaType: string): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/heic") return "heic";
  return "jpg";
}

export async function uploadDaylogPhoto(db: SupabaseClient, dayId: string, buffer: ArrayBuffer | Buffer, mediaType: string, opts: { takenAt?: string | null; caption?: string | null } = {}): Promise<MediaRow> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${dayId}/${Date.now()}-${suffix}.${extensionFor(mediaType)}`;
  const { error } = await db.storage.from(DAYLOG_BUCKET).upload(path, buffer, { contentType: mediaType, upsert: false });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  const { data, error: rowErr } = await db
    .from("daylog_media")
    .insert({ day_id: dayId, storage_path: path, taken_at: opts.takenAt ?? new Date().toISOString(), caption: opts.caption?.trim() || null })
    .select(MEDIA_SELECT)
    .single();
  if (rowErr || !data) {
    await db.storage.from(DAYLOG_BUCKET).remove([path]);
    throw new Error(`daylog_media insert failed: ${rowErr?.message ?? "no row"}`);
  }
  return data as MediaRow;
}

export async function signDaylogMedia(db: SupabaseClient, rows: MediaRow[]): Promise<SignedMedia[]> {
  if (!rows.length) return [];
  const { data } = await db.storage.from(DAYLOG_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), DAYLOG_SIGNED_TTL);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, url: byPath.get(r.storage_path) ?? null }));
}

export async function dayMedia(db: SupabaseClient, dayId: string): Promise<SignedMedia[]> {
  const { data } = await db.from("daylog_media").select(MEDIA_SELECT).eq("day_id", dayId).order("taken_at");
  return signDaylogMedia(db, (data ?? []) as MediaRow[]);
}

export async function removeDaylogMedia(db: SupabaseClient, row: MediaRow): Promise<boolean> {
  const { error, count } = await db.from("daylog_media").delete({ count: "exact" }).eq("id", row.id);
  if (error || !count) return false;
  const { error: rmErr } = await db.storage.from(DAYLOG_BUCKET).remove([row.storage_path]);
  if (rmErr) console.error("[daylog/media] object remove failed:", rmErr.message);
  return true;
}

/**
 * Scene attach by timing (pure). Each scene's span starts at the transcript
 * entry that first mentions it (its `at`) and ends where the next scene's
 * begins; a photo before every span goes to the first scene, after to the
 * last. `sceneStarts` is ordered by position.
 */
export function sceneForMoment(takenAt: string, sceneStarts: Array<{ id: string; at: string }>): string | null {
  if (!sceneStarts.length) return null;
  const t = new Date(takenAt).getTime();
  let chosen = sceneStarts[0].id;
  for (const s of sceneStarts) {
    if (new Date(s.at).getTime() <= t) chosen = s.id;
    else break;
  }
  return chosen;
}

/**
 * When a scene's title first appears in the transcript is the best estimate
 * of when Phil was talking about it — photos sent while he was are its.
 */
export function sceneStartsFromTranscript(scenes: Array<{ id: string; title: string; position: number }>, transcript: Array<{ role: string; at: string; text: string }>): Array<{ id: string; at: string }> {
  const users = transcript.filter((e) => e.role === "user");
  if (!users.length) return [];
  const out: Array<{ id: string; at: string }> = [];
  let floor = users[0].at;
  for (const s of [...scenes].sort((a, b) => a.position - b.position)) {
    const words = s.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3);
    const hit = users.find((e) => e.at >= floor && words.some((w) => e.text.toLowerCase().includes(w)));
    const at = hit?.at ?? floor;
    out.push({ id: s.id, at });
    floor = at;
  }
  return out;
}

/** At close: give every unattached photo of the day a scene (idempotent, only fills nulls). */
export async function attachPhotosToScenes(db: SupabaseClient, dayId: string, transcript: Array<{ role: string; at: string; text: string }>): Promise<number> {
  const [{ data: photos }, { data: scenes }] = await Promise.all([
    db.from("daylog_media").select("id, taken_at, created_at").eq("day_id", dayId).is("scene_id", null),
    db.from("daylog_scenes").select("id, title, position").eq("day_id", dayId).order("position"),
  ]);
  const rows = (photos ?? []) as Array<{ id: string; taken_at: string | null; created_at: string }>;
  const starts = sceneStartsFromTranscript((scenes ?? []) as Array<{ id: string; title: string; position: number }>, transcript);
  if (!rows.length || !starts.length) return 0;
  let n = 0;
  for (const p of rows) {
    const sceneId = sceneForMoment(p.taken_at ?? p.created_at, starts);
    if (!sceneId) continue;
    const { error } = await db.from("daylog_media").update({ scene_id: sceneId }).eq("id", p.id);
    if (!error) n++;
  }
  return n;
}
