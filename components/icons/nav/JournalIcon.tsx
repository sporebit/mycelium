import type { NavIconProps } from "./types";

/** Unfurling fiddlehead — single spiral unrolling from the inside. */
export function JournalIcon({
  size = 20,
  className,
  ariaLabel = "Journal",
}: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <path
        d="M 20 34
           L 20 22
           Q 20 14, 28 14
           Q 36 14, 36 22
           Q 36 28, 28 28
           Q 24 28, 24 24
           Q 24 20, 28 20"
      />
    </svg>
  );
}
