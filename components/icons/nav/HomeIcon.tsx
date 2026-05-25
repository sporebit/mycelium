import type { NavIconProps } from "./types";
import { NAV_GLOW } from "./types";

/** Fruiting body — mushroom in profile with optional spore-drop accent. */
export function HomeIcon({
  size = 20,
  className,
  ariaLabel = "Home",
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
      <path d="M 8 20 Q 8 6, 20 6 Q 32 6, 32 20" />
      <path d="M 8 20 L 32 20" />
      <path d="M 16 20 L 16 34" />
      <path d="M 24 20 L 24 34" />
      {active && (
        <path d="M 20 24 L 20 30" opacity="0.7" stroke={NAV_GLOW} />
      )}
    </svg>
  );
}
