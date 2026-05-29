"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { JournalIcon } from "@/components/icons/nav/JournalIcon";
import { usePrivacy } from "@/lib/context/PrivacyContext";
import type { NavIconProps } from "@/components/icons/nav/types";

type Item = {
  label: string;
  href: string;
  Icon: ComponentType<NavIconProps>;
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

/** Gear/cog for /more settings rows. */
function SettingsIcon({ size = 22, ariaLabel = "Settings" }: NavIconProps) {
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
      <circle cx="20" cy="20" r="4" />
      <path d="M20 6 L20 10 M20 30 L20 34 M6 20 L10 20 M30 20 L34 20 M10 10 L13 13 M27 27 L30 30 M30 10 L27 13 M13 27 L10 30" />
    </svg>
  );
}

const SECTIONS: Item[] = [
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

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-4 mb-2 px-1">
      {children}
    </h2>
  );
}

export function MoreList() {
  const { financeHidden, toggle } = usePrivacy();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
        More
      </h1>

      <GroupHeading>Settings</GroupHeading>
      <ul className="flex flex-col gap-2">
        <li>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={financeHidden}
            className="w-full flex items-center gap-3 bg-ink-1 rounded-md px-4 min-h-[56px] hover:bg-ink-2/40 transition-colors text-left"
          >
            <SettingsIcon size={22} ariaLabel="Privacy mode" />
            <div className="flex-1">
              <div className="text-base text-text-0">Privacy mode</div>
              <div className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.04em] uppercase">
                Hide financial values across the app
              </div>
            </div>
            <span
              className={`text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-2 py-1 rounded-md border ${
                financeHidden
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-ink-2 text-ink-3"
              }`}
            >
              {financeHidden ? "ON" : "OFF"}
            </span>
          </button>
        </li>
      </ul>

      <GroupHeading>Sections</GroupHeading>
      <ul className="flex flex-col gap-2">
        {SECTIONS.map((item) => {
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
