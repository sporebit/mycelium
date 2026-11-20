/**
 * A capture meant for the family (master run §8: "normal capture routed to
 * the family timeline"). Said or typed with the family named first:
 *
 *   "Family: felt the first kick tonight"
 *   "For the baby, we chose the green paint"
 *   "Baby: 20 week scan all fine"
 *
 * It goes on the family timeline as it is, in the words it came in. No
 * model reads it and nothing is guessed: without one of these openings a
 * capture is filed the usual way, and with one but no family space it is
 * too. A picture sent the same way (the opening in its caption) goes on the
 * timeline with the picture.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CAPTURES_BUCKET } from "@/lib/storage/captures";
import { fileKind } from "./files";
import { FAMILY_BUCKET, familyCtx } from "./server";

const OPENING = /^\s*(?:for\s+(?:the\s+)?(?:family|baby)|family(?:\s+(?:timeline|note))?|baby)\s*[:,\-–—]\s*/i;

/** The words after the opening, as a line to go by and the rest. Null when the capture is not addressed to the family. */
export function parseFamilyCapture(text: string): { title: string; body: string | null } | null {
  const m = OPENING.exec(text);
  if (!m) return null;
  const rest = text.slice(m[0].length).trim();
  if (!rest) return null;
  const words = rest.charAt(0).toUpperCase() + rest.slice(1);
  // the first sentence is the line; anything after it is kept whole beneath
  const end = words.search(/(?<=[.!?])\s/);
  const first = (end > 0 ? words.slice(0, end) : words).trim();
  if (first.length <= 120) return { title: first.replace(/[.]$/, ""), body: end > 0 ? words.slice(end).trim() || null : null };
  const cut = words.slice(0, 120);
  const at = cut.lastIndexOf(" ");
  return { title: `${cut.slice(0, at > 60 ? at : 120).trim()}…`, body: words };
}

/**
 * Put the capture on the caller's family timeline. Null when it is not for
 * the family or they have no family space: the pipeline then carries on as
 * it would have.
 */
export async function fileToFamily(db: SupabaseClient, uid: string, capture: { id: string; text: string; photoPath: string | null }): Promise<{ id: string; title: string } | null> {
  const parsed = parseFamilyCapture(capture.text);
  if (!parsed) return null;
  const ctx = await familyCtx(db, uid);
  if (!ctx) return null;

  const row: Record<string, unknown> = { space_id: ctx.spaceId, kind: "note", title: parsed.title, body: parsed.body, source: "capture", capture_id: capture.id };
  if (capture.photoPath) {
    // The picture is copied into the family's own files: it must be readable by everyone there, which the capture's is not.
    const { data: blob } = await db.storage.from(CAPTURES_BUCKET).download(capture.photoPath);
    const kind = blob ? fileKind(blob.type) : null;
    if (blob && kind?.group === "image") {
      const path = `${ctx.spaceId}/${randomUUID()}.${kind.ext}`;
      const { error } = await db.storage.from(FAMILY_BUCKET).upload(path, Buffer.from(await blob.arrayBuffer()), { contentType: kind.mime, upsert: false });
      if (!error) Object.assign(row, { kind: "photo", media_path: path, media_mime: kind.mime });
    }
  }
  const { data, error } = await db.from("family_entries").insert(row).select("id").single();
  if (error || !data) {
    // not filed: leave no file behind, and let the capture be filed the usual way
    if (row.media_path) await db.storage.from(FAMILY_BUCKET).remove([row.media_path as string]);
    console.error("[family] capture not filed:", error?.message);
    return null;
  }
  return { id: (data as { id: string }).id, title: parsed.title };
}
