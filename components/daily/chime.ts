/**
 * The completion sound (research rules 7 and 24, §4 "surprise reward vs
 * predictability"): the same soft tone every time, a slightly fuller one
 * when the day's one thing is finished. Made in code, so there is no audio
 * file to load and nothing plays before a tap. Silent if the browser has no
 * audio, if the person turned the chime off, or if they asked the system
 * for reduced motion AND muted sound (the setting is the switch; this never
 * overrides it).
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, length: number, peak: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/** `win` = the day's one thing was finished: two notes instead of one. */
export function playChime(win = false): void {
  try {
    const ac = context();
    if (!ac) return;
    if (ac.state === "suspended") void ac.resume();
    const t = ac.currentTime + 0.01;
    tone(ac, 660, t, 0.35, 0.06);
    if (win) tone(ac, 880, t + 0.16, 0.5, 0.06);
  } catch {
    /* a sound is never worth an error */
  }
}
