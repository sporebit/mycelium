/**
 * Tiny one-shot interactive feedback helper.
 *
 * Adds the .glow-pulse class for the duration of the animation, then strips
 * it so the next call re-fires cleanly. Safe to call on any HTMLElement —
 * the keyframe is global (see app/globals.css).
 *
 *   <button onClick={(e) => triggerGlowPulse(e.currentTarget)}>…</button>
 */
export function triggerGlowPulse(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("glow-pulse"); // restart if already animating
  // Force reflow so a freshly re-added class starts a new animation cycle.
  void el.offsetWidth;
  el.classList.add("glow-pulse");
  window.setTimeout(() => el.classList.remove("glow-pulse"), 250);
}

// ── Mycelium field pulse ─────────────────────────────────────────────
// Small pub/sub over a window CustomEvent. Followed the triggerGlowPulse
// pattern for symmetry — one file, no separate event bus module.

export type FieldPulseDetail = { x: number; y: number };

const FIELD_PULSE_EVENT = "mycelium-field-pulse";

/**
 * Emit a capture-pulse ripple centred at the given screen coordinates.
 * Called from capture success paths (FloatingCapture, TabBar FAB via the
 * shared open-capture flow). MyceliumField renders the ripple.
 */
export function triggerFieldPulse(x: number, y: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<FieldPulseDetail>(FIELD_PULSE_EVENT, {
      detail: { x, y },
    }),
  );
}

/**
 * Subscribe to pulse events. Returns an unsubscribe function.
 */
export function onFieldPulse(
  cb: (d: FieldPulseDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) =>
    cb((e as CustomEvent<FieldPulseDetail>).detail);
  window.addEventListener(FIELD_PULSE_EVENT, handler);
  return () => window.removeEventListener(FIELD_PULSE_EVENT, handler);
}
