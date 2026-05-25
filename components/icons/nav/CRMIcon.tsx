import type { NavIconProps } from "./types";
import { NAV_GLOW } from "./types";

/** Hyphal network — central node radiating threads to four outer nodes. */
export function CRMIcon({
  size = 20,
  className,
  ariaLabel = "CRM",
  active = false,
}: NavIconProps) {
  const centerFill = active ? NAV_GLOW : "currentColor";
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
      <path d="M 20 20 L 6 10" />
      <path d="M 20 20 L 34 10" />
      <path d="M 20 20 L 6 30" />
      <path d="M 20 20 L 34 30" />
      <circle cx="6" cy="10" r="2" fill="currentColor" stroke="none" />
      <circle cx="34" cy="10" r="2" fill="currentColor" stroke="none" />
      <circle cx="6" cy="30" r="2" fill="currentColor" stroke="none" />
      <circle cx="34" cy="30" r="2" fill="currentColor" stroke="none" />
      <circle
        cx="20"
        cy="20"
        r="3.5"
        fill={centerFill}
        stroke={centerFill}
      />
    </svg>
  );
}
