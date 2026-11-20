/**
 * Nothing captured is left behind (master run §0: "Capture must never lose
 * anything").
 *
 * A capture is safe the moment its row exists. What can still go wrong is
 * the part after that: the function was cut off before it classified, the
 * model was down, the PC was off when only audio arrived. The sweep finds
 * the person's own captures in those states and finishes them.
 *
 * It runs under the person's own access, so it needs no special rights. It
 * is called after every capture and whenever Today is opened (the leftovers
 * get done the next time the person shows up), and nightly for everyone.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cloudAllowed } from "@/lib/ai/budget";
import { pcIsOn } from "@/lib/jobs/queue";
import { transcribeAudio } from "@/lib/openai/whisper";
import { downloadCaptureAudio } from "@/lib/storage/captures";
import { applyTranscript } from "./jobs";
import { processCapture } from "./pipeline";

/** A capture younger than this is still being handled by the request that received it. */
const SETTLE_SECONDS = 90;
/** Audio with no words waits this long for the PC before the cloud may transcribe it. */
const AUDIO_WAIT_SECONDS = 180;
const MAX_ATTEMPTS = 5;

export type SweepResult = { processed: number; transcribed: number; left: number };

type Stuck = { id: string; raw_text: string | null; audio_path: string | null; status: string; process_attempts: number; created_at: string };

export async function sweepCaptures(db: SupabaseClient, uid: string, opts: { limit?: number; now?: Date } = {}): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const settled = new Date(now.getTime() - SETTLE_SECONDS * 1000).toISOString();
  const stuck = () =>
    db
      .from("raw_captures")
      .select("id, raw_text, audio_path, status, process_attempts, created_at")
      .eq("created_by", uid)
      .in("status", ["received", "failed"])
      .is("deleted_at", null)
      .lt("created_at", settled)
      .lt("process_attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(opts.limit ?? 10);
  // Two reads, not one. A recording still waiting for its words is "left" without an attempt being counted,
  // so in a single oldest-first list a handful of them sat at the front for ever and no capture with words
  // behind them was ever reached.
  const [{ data: withWords }, { data: audioOnly }] = await Promise.all([stuck().not("raw_text", "is", null), stuck().is("raw_text", null)]);
  const rows = [...((withWords ?? []) as Stuck[]), ...((audioOnly ?? []) as Stuck[])];
  const out: SweepResult = { processed: 0, transcribed: 0, left: 0 };
  if (!rows.length) return out;

  let cloud: boolean | null = null;
  let pc: boolean | null = null;

  for (const row of rows) {
    try {
      if (row.raw_text?.trim()) {
        const r = await processCapture(db, uid, row.id, { reply: false });
        if (r.state === "done") out.processed += 1;
        else out.left += 1;
        continue;
      }
      // Only audio so far. The PC transcribes for nothing; give it its chance.
      const age = (now.getTime() - new Date(row.created_at).getTime()) / 1000;
      if (!row.audio_path || age < AUDIO_WAIT_SECONDS) {
        out.left += 1;
        continue;
      }
      pc ??= await pcIsOn(db);
      cloud ??= await cloudAllowed(db);
      if (pc || !cloud || !process.env.OPENAI_API_KEY) {
        out.left += 1;
        continue;
      }
      const audio = await downloadCaptureAudio(db, row.audio_path);
      if (!audio) {
        out.left += 1;
        continue;
      }
      const ext = row.audio_path.split(".").pop() ?? "m4a";
      const text = await transcribeAudio(audio, `capture.${ext}`, `audio/${ext === "m4a" ? "mp4" : ext}`, { feature: "capture.transcribe" });
      await db.from("raw_captures").update({ process_attempts: row.process_attempts + 1 }).eq("id", row.id);
      const applied = await applyTranscript(db, uid, row.id, text, "whisper_cloud");
      if (applied === "used") out.transcribed += 1;
      else out.left += 1;
    } catch (err) {
      console.error(`[capture/sweep] ${row.id}:`, err);
      out.left += 1;
    }
  }
  return out;
}
