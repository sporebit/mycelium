/**
 * The wall's voice (master run §11). One function, `say`, and one way to
 * replace it: the browser's own speech now; the PC voice (lane E2) can be
 * plugged in with `setSpeaker` and nothing else on the wall changes. Never
 * speaks on its own: the wall decides when (lib/wall/schedule.ts maySpeak).
 */

export type Speaker = (text: string) => void | Promise<void>;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === "en-GB" && /female|Google UK English Female|Hazel|Libby|Sonia/i.test(v.name)) ?? voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
}

/** The browser's speech synthesis: free, offline, on every frame that runs a browser. */
export const browserSpeaker: Speaker = (text) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GB";
  u.rate = 0.95;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
};

let speaker: Speaker = browserSpeaker;

/** Swap the voice (the PC voice, a test spy). Returns the previous one. */
export function setSpeaker(next: Speaker): Speaker {
  const prev = speaker;
  speaker = next;
  return prev;
}

export function say(text: string): void | Promise<void> {
  const line = text.trim();
  if (!line) return;
  return speaker(line);
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Stop anything mid-sentence (a tap, a lock, nightfall). */
export function hush(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
