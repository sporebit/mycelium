import Link from "next/link";

/**
 * Mycelium wordmark — anchors the top bar on every viewport.
 *
 * The text reads "Mycelium" rendered uppercase via CSS, in Recoleta (the
 * --font-display family). A 3-second bioluminescent glow sweeps L→R
 * across the letterforms via `wordmark-glow` (background-clip: text +
 * animated background-position), defined in globals.css. The trailing
 * 8px spore-dot keeps its slower 5s spore-pulse independently.
 *
 * prefers-reduced-motion disables both animations (handled in globals.css).
 *
 * The wordmark IS the home link — tapping anywhere on it routes to /.
 */
export function Wordmark() {
  return (
    <Link
      href="/"
      aria-label="Mycelium — dashboard"
      className="inline-flex items-center text-sm font-[family-name:var(--font-display)] font-medium uppercase tracking-[0.04em]"
    >
      <span aria-hidden className="wordmark-glow mycelium-wordmark">
        Mycelium
      </span>
      <span
        aria-hidden
        className="ml-2 inline-block align-middle"
        style={{ width: 8, height: 8 }}
      >
        <svg
          viewBox="0 0 8 8"
          width={8}
          height={8}
          className="spore-pulse"
        >
          <circle cx="4" cy="4" r="4" fill="var(--glow-0)" />
        </svg>
      </span>
    </Link>
  );
}
