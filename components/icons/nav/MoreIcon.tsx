import type { NavIconProps } from "./types";
import { NAV_GLOW } from "./types";

/** Three horizontal spore-dots — the "more / everything else" glyph. */
export function MoreIcon({
  size = 20,
  className,
  ariaLabel = "More",
  active = false,
}: NavIconProps) {
  const dotFill = active ? NAV_GLOW : "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <circle cx="10" cy="20" r="2.5" fill={dotFill} stroke="none" />
      <circle cx="20" cy="20" r="2.5" fill={dotFill} stroke="none" />
      <circle cx="30" cy="20" r="2.5" fill={dotFill} stroke="none" />
    </svg>
  );
}
