/**
 * When the wall shows what (master run §11). Pure rules, London time, so
 * they can be tested without a screen.
 *
 *   active   someone touched it lately: the board, a person's view, guest
 *   idle     nobody has for a while: the ambient view (Specimen plate
 *            direction), moving slowly so the panel does not burn in
 *   night    23:00 to 06:00: dimmed, and nothing is said aloud
 *
 * A person's unlock lasts ten minutes at most on the server and ends sooner
 * here when nobody touches the screen, so a view left open on the kitchen
 * wall closes itself.
 */

export const IDLE_AFTER_MS = 3 * 60_000;
/** Inactivity after which an unlocked person's view locks itself (shorter than the note's ten minutes). */
export const LOCK_AFTER_MS = 2 * 60_000;
export const NIGHT_FROM_HOUR = 23;
export const NIGHT_TO_HOUR = 6;
/** How often the ambient view moves its figure, so no pixel stays lit (anti burn-in). */
export const DRIFT_EVERY_MS = 60_000;
/** How often the wall asks for things to say aloud. */
export const SAY_EVERY_MS = 20_000;
/** How often the board is redrawn from the server. */
export const REFRESH_EVERY_MS = 5 * 60_000;

export type WallMode = "active" | "idle" | "night";

export function londonHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(now)) % 24;
}

export function isNight(now: Date): boolean {
  const h = londonHour(now);
  return h >= NIGHT_FROM_HOUR || h < NIGHT_TO_HOUR;
}

/** A touch always wins over the clock: the night view lifts for the usual idle span. */
export function wallMode(now: Date, lastTouch: number, idleAfter: number = IDLE_AFTER_MS): WallMode {
  const quiet = now.getTime() - lastTouch >= idleAfter;
  if (!quiet) return "active";
  return isNight(now) ? "night" : "idle";
}

/** Screen brightness for a mode, 0–1. Night is dim but legible from the doorway. */
export function dimLevel(mode: WallMode): number {
  if (mode === "night") return 0.25;
  if (mode === "idle") return 0.7;
  return 1;
}

/** Should something be said aloud now? Never at night, never without a voice. */
export function maySpeak(now: Date, voiceOn: boolean): boolean {
  return voiceOn && !isNight(now);
}

/** Has an unlocked person's view been left alone long enough to lock? */
export function shouldLock(now: Date, lastTouch: number, lockAfter: number = LOCK_AFTER_MS): boolean {
  return now.getTime() - lastTouch >= lockAfter;
}

/** Where the ambient figure sits this minute: a slow walk around the panel, never the same spot twice in a row. */
export function driftPosition(tick: number): { x: number; y: number } {
  const golden = 0.618033988749895;
  const x = 0.2 + ((tick * golden) % 1) * 0.6;
  const y = 0.25 + (((tick * golden * 7) % 1) * 0.5);
  return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
}
