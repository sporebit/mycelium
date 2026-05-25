import type { NavIconProps } from "./types";
import { NAV_GLOW } from "./types";

/** Spore burst — circle with 8 radial spokes; centre fills on active. */
export function FitnessIcon({
  size = 20,
  className,
  ariaLabel = "Fitness",
  active = false,
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
      <circle
        cx="20"
        cy="20"
        r="3.5"
        fill={active ? NAV_GLOW : "none"}
        stroke="currentColor"
      />
      <path d="M 20 12 L 20 4" />
      <path d="M 20 28 L 20 36" />
      <path d="M 12 20 L 4 20" />
      <path d="M 28 20 L 36 20" />
      <path d="M 14 14 L 8 8" />
      <path d="M 26 14 L 32 8" />
      <path d="M 14 26 L 8 32" />
      <path d="M 26 26 L 32 32" />
    </svg>
  );
}
