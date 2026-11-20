/**
 * The PC's voice, server side (master run §9, §11). One function,
 * `requestSpeech`: hand it a line and it answers with a file to play, or
 * says the PC is rendering it, or says the PC is off. The caller (the wall,
 * a nudge, the briefing) falls back to the browser's voice in the last two
 * cases and asks again next time; the clip is there from then on.
 *
 * The `speak` job: the cloud makes the clip's row and a signed upload link
 * for its file; the PC renders the WAV with Kokoro and PUTs it to the link;
 * the result stamps the row ready. Importing this file registers the
 * handler (lib/jobs/register.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerJobHandler } from "@/lib/jobs/handlers";
import { enqueueJob, pcIsOn } from "@/lib/jobs/queue";
import { cleanLine, clipKey, clipPath, DEFAULT_VOICE, isVoice, SPEECH_BUCKET, SPEECH_SIGNED_TTL, type SpeechAnswer, type Voice } from "./clips";

export const SPEAK_KIND = "speak";

type ClipRow = { id: string; path: string | null; seconds: number | null; ready_at: string | null; created_at: string };
const CLIP_COLS = "id, path, seconds, ready_at, created_at";

/** A clip asked for but not rendered within this long is asked for again (the PC was off, or the job was lost). */
const STALE_MS = 6 * 60 * 60_000;

async function findClip(db: SupabaseClient, key: string): Promise<ClipRow | null> {
  const { data } = await db.from("speech_clips").select(CLIP_COLS).eq("key", key).maybeSingle();
  return (data as ClipRow | null) ?? null;
}

async function signClip(db: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await db.storage.from(SPEECH_BUCKET).createSignedUrl(path, SPEECH_SIGNED_TTL);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * The file for a line, or what to do instead. `db` acts as the person the
 * line is for. Never throws for the caller's sake: a database blip answers
 * "off", and the browser speaks.
 */
export async function requestSpeech(db: SupabaseClient, text: string, opts: { voice?: string } = {}): Promise<SpeechAnswer> {
  const line = cleanLine(text);
  if (!line) return { status: "empty" };
  const voice: Voice = isVoice(opts.voice) ? opts.voice : DEFAULT_VOICE;
  const key = clipKey(voice, line);
  try {
    const existing = await findClip(db, key);
    if (existing?.ready_at && existing.path) {
      const url = await signClip(db, existing.path);
      if (url) {
        void db.from("speech_clips").update({ last_played_at: new Date().toISOString() }).eq("id", existing.id).then(() => undefined);
        return { status: "ready", url, seconds: existing.seconds, clip_id: existing.id };
      }
    }
    if (!(await pcIsOn(db))) return { status: "off" };

    let clipId = existing?.id ?? null;
    if (existing && !existing.ready_at && Date.now() - new Date(existing.created_at).getTime() > STALE_MS) {
      // Asked long ago and never rendered: start again from a clean row.
      await db.from("speech_clips").delete().eq("id", existing.id);
      clipId = null;
    }
    if (!clipId) {
      const { data, error } = await db.from("speech_clips").insert({ key, voice, text: line }).select("id").single();
      if (error) {
        // Two requests for the same new line at once: the other one made the row.
        const again = await findClip(db, key);
        if (!again) return { status: "off" };
        clipId = again.id;
      } else {
        clipId = (data as { id: string }).id;
      }
    }
    await enqueueJob(db, { kind: SPEAK_KIND, payload: { clip_id: clipId }, lane: "pc", dedupeKey: `speak:${clipId}`, maxAttempts: 2 });
    return { status: "queued", clip_id: clipId };
  } catch (err) {
    console.error("[speech] request failed; the browser speaks:", err instanceof Error ? err.message : err);
    return { status: "off" };
  }
}

/** Ask for several lines ahead of time (tomorrow's briefing, tonight's nudges) so they are ready when wanted. */
export async function warmSpeech(db: SupabaseClient, lines: readonly string[], opts: { voice?: string } = {}): Promise<number> {
  let queued = 0;
  for (const line of lines) {
    const a = await requestSpeech(db, line, opts);
    if (a.status === "queued") queued += 1;
    if (a.status === "off") break;
  }
  return queued;
}

registerJobHandler(SPEAK_KIND, {
  prepare: async (job, db) => {
    const clipId = typeof job.payload.clip_id === "string" ? job.payload.clip_id : "";
    const { data } = await db.from("speech_clips").select("id, voice, text, ready_at").eq("id", clipId).maybeSingle();
    const clip = data as { id: string; voice: string; text: string; ready_at: string | null } | null;
    if (!clip) throw new Error("the clip is gone");
    if (clip.ready_at) return { text: "", voice: clip.voice, already: true };
    const path = clipPath(clip.id);
    // The PC puts the file straight into the bucket, as this person, within the hour.
    const { data: signed, error } = await db.storage.from(SPEECH_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !signed?.signedUrl) throw new Error(`upload link not made: ${error?.message ?? "no url"}`);
    return { text: clip.text, voice: clip.voice, upload_url: signed.signedUrl, path };
  },
  apply: async (job, result, db) => {
    const clipId = typeof job.payload.clip_id === "string" ? job.payload.clip_id : "";
    if (!clipId || result.already === true) return;
    const seconds = typeof result.seconds === "number" && Number.isFinite(result.seconds) ? Math.round(result.seconds * 100) / 100 : null;
    const bytes = typeof result.bytes === "number" && Number.isFinite(result.bytes) ? Math.round(result.bytes) : null;
    const { error } = await db
      .from("speech_clips")
      .update({ path: clipPath(clipId), seconds, bytes, ready_at: new Date().toISOString() })
      .eq("id", clipId);
    if (error) throw new Error(`clip not stamped ready: ${error.message}`);
  },
  onGiveUp: async (job, _error, db) => {
    // Leave no half-made clip behind: the next request makes a fresh one.
    const clipId = typeof job.payload.clip_id === "string" ? job.payload.clip_id : "";
    if (clipId) await db.from("speech_clips").delete().eq("id", clipId).is("ready_at", null);
  },
});
