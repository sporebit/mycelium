/**
 * Subtle warm-noise overlay rendered as an SVG feTurbulence filter.
 * Fixed-position behind app content, ~2.2% effective opacity via the
 * feColorMatrix alpha — visible only when looked for. Sits at z-0 so
 * the main app content (z-10+) layers cleanly above.
 */
export function SoilGrain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{ mixBlendMode: "overlay" }}
    >
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <filter id="soil-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="7"
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.85
                    0 0 0 0 0.78
                    0 0 0 0 0.65
                    0 0 0 0.022 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#soil-noise)" />
      </svg>
    </div>
  );
}
