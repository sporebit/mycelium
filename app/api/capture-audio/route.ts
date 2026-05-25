import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/openai/whisper";
import { classifyCapture } from "@/lib/router/classifyCapture";
import { writeCapture } from "@/lib/router/writeCapture";
import { embedAndStore } from "@/lib/router/embedAndStore";
import { routeRawVoice } from "@/lib/fitness/voice-route";

export const runtime = "nodejs";
// Audio uploads can be sizeable; keep this generous.
export const maxDuration = 60;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/**
 * Multipart audio capture endpoint. Designed for the iOS Shortcut but also
 * usable from any client that can POST a form.
 *
 * Auth: middleware accepts X-API-Secret (programmatic) or a session cookie.
 *
 * Fields:
 *   audio:  file (m4a/mp3/wav/mp4/mpeg/mpga/oga/ogg/webm — Whisper-supported)
 *   kind:   optional string — force-classify (skips Call 1)
 *   source: optional string — analytics tag (e.g. "ios_shortcut")
 */
export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }
  const forcedKind = (form.get("kind") as string | null)?.trim() || null;
  const source = (form.get("source") as string | null)?.trim() || "api";

  // 1. Transcribe via Whisper
  let transcription: string;
  try {
    const buffer = await audio.arrayBuffer();
    const ext = inferExt(audio.name, audio.type);
    transcription = await transcribeAudio(
      buffer,
      audio.name || `capture.${ext}`,
      audio.type || `audio/${ext}`
    );
  } catch (err) {
    console.error("[capture-audio] transcription failed:", err);
    return NextResponse.json(
      {
        error: "transcription_failed",
        summary: "Couldn't transcribe — was the audio recorded properly?",
      },
      { status: 502 }
    );
  }
  const trimmed = transcription.trim();
  if (!trimmed) {
    return NextResponse.json(
      {
        kind: null,
        transcription: "",
        routed: null,
        needs_confirmation: false,
        pending_route_id: null,
        summary: "Couldn't transcribe — was the audio recorded properly?",
      },
      { status: 200 }
    );
  }

  // 2. Classify (skip if caller forced)
  let kind: string;
  if (forcedKind) {
    kind = forcedKind;
  } else {
    const { classification } = await classifyCapture(trimmed);
    kind = classification.kind;
  }

  // 3. Route
  if (kind === "workout") {
    try {
      const r = await routeRawVoice(trimmed, uid);
      if (r.kind === "routed") {
        return NextResponse.json({
          kind: "workout",
          transcription: trimmed,
          source,
          routed: {
            session_id: r.result.session_id,
            session_name: r.result.session_name,
            exercises_logged: r.result.exercises_logged,
            sets_logged: r.result.sets_logged,
            pain_logs: r.result.pain_logs,
            cardio_logged: r.result.cardio_logged,
          },
          needs_confirmation: false,
          pending_route_id: null,
          summary: r.result.summary,
        });
      }
      // Pending — needs user confirmation
      const candidates = r.parsed.candidate_session_ids;
      return NextResponse.json({
        kind: "workout",
        transcription: trimmed,
        source,
        routed: null,
        needs_confirmation: true,
        pending_route_id: r.pending_route_id,
        candidate_session_ids: candidates,
        summary:
          "Multiple sessions match — open Telegram to pick one, or POST /api/fitness/pending-routes/[id]/resolve",
      });
    } catch (err) {
      console.error("[capture-audio] workout route failed:", err);
      return NextResponse.json(
        { error: "workout_routing_failed", transcription: trimmed },
        { status: 500 }
      );
    }
  }

  // Non-workout: run the existing capture pipeline so we still write raw_captures,
  // tasks/notes/etc.
  try {
    const { classification, llm_source } = await classifyCapture(trimmed);
    const result = await writeCapture({
      userId: uid,
      source: "api",
      rawText: trimmed,
      classification,
      llmSource: llm_source,
    });
    void embedAndStore({
      userId: uid,
      sourceType: result.memorySourceType,
      sourceId: result.memorySourceId,
      text: trimmed,
    });
    return NextResponse.json({
      kind: classification.kind,
      transcription: trimmed,
      source,
      routed: {
        kind: classification.kind,
        routed_to: result.routedTo,
        routed_id: result.routedId,
        title: classification.title,
        urgency: classification.urgency,
      },
      needs_confirmation: false,
      pending_route_id: null,
      summary: `Captured as ${classification.kind.toUpperCase()} — ${classification.title}`,
    });
  } catch (err) {
    console.error("[capture-audio] capture pipeline failed:", err);
    return NextResponse.json(
      { error: "capture_failed", transcription: trimmed },
      { status: 500 }
    );
  }
}

function inferExt(name: string, mime: string): string {
  if (name && name.includes(".")) {
    const ext = name.split(".").pop()!.toLowerCase();
    if (ext.length <= 5) return ext;
  }
  if (mime) {
    const part = mime.split("/")[1]?.split(";")[0]?.toLowerCase();
    if (part) return part;
  }
  return "ogg";
}
