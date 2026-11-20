/**
 * The PC's voice (master run §9 "local first", §11 speakers): the pure part.
 *
 * A spoken line is a clip: the words, the voice, and a key made of both, so
 * the same line in the same voice is rendered once and played many times.
 * The PC renders it (pc-worker/speak.py, Kokoro, Apache 2.0, no paid
 * service) and uploads a WAV; the app serves it by signed link. When the PC
 * is off or has not got to it yet, the browser's own voice says the line
 * (lib/speech/client.ts), so nothing waits on the PC.
 */
import { createHash } from "node:crypto";

/** Kokoro's British voices (hexgrad/Kokoro-82M VOICES.md); the research picked Emma first. */
export const VOICES = ["bf_emma", "bf_isabella", "bf_alice", "bf_lily", "bm_george", "bm_fable", "bm_lewis", "bm_daniel"] as const;
export type Voice = (typeof VOICES)[number];
export const DEFAULT_VOICE: Voice = "bf_emma";

/** A line long enough for a briefing paragraph, short enough to render in a few seconds. */
export const MAX_LINE_CHARS = 1_200;

export const SPEECH_BUCKET = "speech";
export const SPEECH_SIGNED_TTL = 3_600;

export function isVoice(v: unknown): v is Voice {
  return typeof v === "string" && (VOICES as readonly string[]).includes(v);
}

/** The words as they will be spoken: one space between words, no leading or trailing space, capped. Empty when there is nothing to say. */
export function cleanLine(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LINE_CHARS);
}

/** One key per (voice, words). */
export function clipKey(voice: string, text: string): string {
  return createHash("sha256").update(`${voice}\n${cleanLine(text)}`).digest("hex");
}

/** Where a clip's file lives in the bucket: its row's id, so the bucket policy can tie the file to the row. */
export function clipPath(clipId: string): string {
  return `${clipId}/clip.wav`;
}

export type SpeechAnswer =
  /** The PC has rendered it: play this. */
  | { status: "ready"; url: string; seconds: number | null; clip_id: string }
  /** The PC is on and will render it; say it yourself this time. */
  | { status: "queued"; clip_id: string }
  /** The PC is off: say it yourself. */
  | { status: "off" }
  /** Nothing to say. */
  | { status: "empty" };
