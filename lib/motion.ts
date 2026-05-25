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
