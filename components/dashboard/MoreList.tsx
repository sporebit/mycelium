import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { JournalIcon } from "@/components/icons/nav/JournalIcon";
import type { NavIconProps } from "@/components/icons/nav/types";

type Item = {
  label: string;
  href: string;
  Icon: ComponentType<NavIconProps>;
  description?: string;
};

/** £ glyph in a circle — a "finance" icon that fits the existing nav set. */
function FinanceIcon({ size = 22, ariaLabel = "Finance" }: NavIconProps) {
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
      role="img"
      aria-label={ariaLabel}
    >
      <circle cx="20" cy="20" r="14" />
      <path d="M24 13 Q19 12 17 16 L17 22 L14 22 M14 25 L23 25 M17 25 L17 22 L20 22" />
    </svg>
  );
}

/** Heart silhouette for /health. */
function HealthIcon({ size = 22, ariaLabel = "Health" }: NavIconProps) {
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
      role="img"
      aria-label={ariaLabel}
    >
      <path d="M20 32 C 10 25, 6 18, 10 13 C 14 8, 18 11, 20 14 C 22 11, 26 8, 30 13 C 34 18, 30 25, 20 32 Z" />
    </svg>
  );
}

/** Clipboard for /review. */
function ReviewIcon({ size = 22, ariaLabel = "Review" }: NavIconProps) {
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
      role="img"
      aria-label={ariaLabel}
    >
      <rect x="11" y="9" width="18" height="24" rx="2" />
      <path d="M16 9 L16 6 L24 6 L24 9" />
      <path d="M15 17 L25 17 M15 22 L25 22 M15 27 L21 27" />
    </svg>
  );
}

const ITEMS: Item[] = [
  { label: "Finance", href: "/finance", Icon: FinanceIcon },
  { label: "Health", href: "/health", Icon: HealthIcon },
  { label: "Journal", href: "/journal", Icon: JournalIcon },
  { label: "Review", href: "/review", Icon: ReviewIcon },
];

function Chevron(): ReactNode {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 3 L9 7 L5 11" />
    </svg>
  );
}

export function MoreList() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
        More
      </h1>
      <ul className="flex flex-col gap-2">
        {ITEMS.map((item) => {
          const Icon = item.Icon;
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-center gap-3 bg-ink-1 rounded-md px-4 min-h-[56px] hover:bg-ink-2/40 transition-colors"
              >
                <Icon size={22} ariaLabel={item.label} />
                <span className="flex-1 text-base text-text-0">
                  {item.label}
                </span>
                <span className="text-ink-3">
                  <Chevron />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
