"use client";
/**
 * The PC's voice in the browser (master run §11). `pcSpeaker(fallback)` is
 * a Speaker for the wall (lib/wall/speak.ts setSpeaker): it asks
 * /api/speech for the line; a ready clip is played, anything else is
 * handed to `fallback` (the browser's own voice). The first time a line is
 * asked for the PC renders it; from then on it is the PC's voice.
 */

export type SpeakFallback = (text: string) => void | Promise<void>;

type Answer = { status: "ready"; url: string } | { status: "queued" | "off" | "empty" };

let playing: HTMLAudioElement | null = null;

/** Play one clip; a second call stops the first (a wall says one thing at a time). */
export function playClip(url: string): Promise<void> {
  return new Promise((resolve) => {
    if (playing) {
      playing.pause();
      playing = null;
    }
    const audio = new Audio(url);
    playing = audio;
    audio.onended = () => {
      if (playing === audio) playing = null;
      resolve();
    };
    audio.onerror = () => {
      if (playing === audio) playing = null;
      resolve();
    };
    void audio.play().catch(() => resolve());
  });
}

export function stopClip(): void {
  if (playing) {
    playing.pause();
    playing = null;
  }
}

export function pcSpeaker(fallback: SpeakFallback, voice?: string, endpoint = "/api/speech"): (text: string) => Promise<void> {
  return async (text: string) => {
    const line = text.trim();
    if (!line) return;
    let answer: Answer | null = null;
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: line, voice }) });
      if (res.ok) answer = (await res.json()) as Answer;
    } catch {
      answer = null;
    }
    if (answer?.status === "ready") {
      await playClip(answer.url);
      return;
    }
    if (answer?.status === "empty") return;
    await fallback(line);
  };
}
