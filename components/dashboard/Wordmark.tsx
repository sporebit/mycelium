import Link from "next/link";

/**
 * Mycelium wordmark — sits at the left of the top rail.
 *
 * Desktop:  MYCELIUM ·   (full word + spore-dot)
 * Mobile:   M ·          (initial only + dot)
 *
 * The trailing dot is an actual 4px circle in --glow-0, not a typographic
 * middot. It breathes at 5s intervals via the .spore-pulse class defined in
 * globals.css; prefers-reduced-motion disables the animation.
 */
export function Wordmark() {
  return (
    <Link
      href="/"
      aria-label="Mycelium — home"
      className="inline-flex items-center text-sm font-[family-name:var(--font-display)] font-medium uppercase tracking-[0.04em] text-text-0"
    >
      {/* Desktop word */}
      <span className="hidden sm:inline" aria-hidden>
        MYCELIUM
      </span>
      {/* Mobile initial */}
      <span className="sm:hidden" aria-hidden>
        M
      </span>
      {/* Spore-dot — 8px after the word */}
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
