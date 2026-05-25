import type { NavIconProps } from "./types";

/** Dense mycelial mat — three undulating horizontals, three faint verticals. */
export function BrainIcon({
  size = 20,
  className,
  ariaLabel = "Brain",
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
      <path d="M 6 14 Q 14 6, 20 11 Q 26 6, 34 14" />
      <path d="M 6 20 Q 16 16, 20 20 Q 24 16, 34 20" />
      <path d="M 6 26 Q 14 34, 20 29 Q 26 34, 34 26" />
      <path d="M 14 10 L 14 34" opacity="0.35" />
      <path d="M 20 8 L 20 34" opacity="0.35" />
      <path d="M 26 10 L 26 34" opacity="0.35" />
    </svg>
  );
}
