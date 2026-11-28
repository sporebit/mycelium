/**
 * Field guide motion (design §1 D13). The thread grows over 480 ms,
 * numbers count over 400 ms, a phase's fruit draws in over 320 ms, the
 * finish moment runs 1.2 s once, and the next sitting opens 600 ms after a
 * phase finishes. Under `[data-motion="reduced"]` (or the OS asking for
 * reduced motion) the thread and fruits appear at once and numbers do not
 * count; under `off` nothing moves. Nothing loops.
 */

export type MotionLevel = "full" | "reduced" | "off";

export const DURATIONS = {
  thread: 480,
  count: 400,
  fruit: 320,
  finish: 1200,
  nextPhase: 600,
  /** How long an irreversible step stays armed after the first tap. */
  arm: 4000,
} as const;

export type MotionName = keyof typeof DURATIONS;

/** What still moves at each level. `arm` is a timeout, not motion, so it never shrinks. */
const KEEP: Record<MotionLevel, ReadonlySet<MotionName>> = {
  full: new Set<MotionName>(["thread", "count", "fruit", "finish", "nextPhase", "arm"]),
  reduced: new Set<MotionName>(["finish", "nextPhase", "arm"]),
  off: new Set<MotionName>(["arm"]),
};

/** The duration to use for `name` at `level`; 0 means "jump straight to the end". */
export function durationFor(name: MotionName, level: MotionLevel): number {
  return KEEP[level].has(name) ? DURATIONS[name] : 0;
}

export function isMotionLevel(v: unknown): v is MotionLevel {
  return v === "full" || v === "reduced" || v === "off";
}

/**
 * The page's motion level: the `data-motion` attribute the layout renders
 * from ui_prefs, lowered to "reduced" when the OS asks for reduced motion.
 * "full" on the server.
 */
export function motionLevel(doc: Document | undefined = typeof document === "undefined" ? undefined : document): MotionLevel {
  if (!doc) return "full";
  const attr = doc.documentElement?.dataset?.motion;
  const level: MotionLevel = isMotionLevel(attr) ? attr : "full";
  if (level === "full" && typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return "reduced";
  }
  return level;
}

/** Ease-out cubic, for the counting numbers. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/** The value a count-up shows `elapsed` ms into a count from `from` to `to`. */
export function countAt(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  return Math.round(from + (to - from) * easeOut(elapsed / duration));
}
