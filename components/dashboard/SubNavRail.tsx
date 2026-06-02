"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type SubNavTab = {
  label: string;
  href: string;
  /** Custom active matcher. Defaults to: exact match, or pathname
   *  starts with `${href}/` for sub-routes. */
  match?: (pathname: string) => boolean;
};

/**
 * Horizontal section sub-nav (OVERVIEW / TASKS / PROJECTS / …) used by
 * every top-level area (Compost, Fitness, Stroma, Health, Finance).
 *
 * Mobile concerns: the rail must scroll WITHIN itself without dragging
 * the page sideways. Trailing `pr-12` (instead of the old `-mx-4 px-4`
 * trick) keeps the last tab reachable in browsers that don't include
 * scroll-container padding-right in the scrollable area. A right-edge
 * fade hints there's more.
 */
export function SubNavRail({
  tabs,
  defaultMatch,
}: {
  tabs: SubNavTab[];
  /** Optional override for the default activeness rule. Useful when a
   *  section has a quirky root (e.g. /fitness === TODAY tab, not the
   *  overview tab). Receives the pathname and the tab; returns true if
   *  this tab should be considered active. */
  defaultMatch?: (pathname: string, tab: SubNavTab) => boolean;
}): ReactNode {
  const pathname = usePathname();
  return (
    <div className="relative -mx-4 sm:mx-0 mb-4">
      <nav
        aria-label="Section"
        className="no-scrollbar flex items-center gap-1 border-b border-ink-2 overflow-x-auto pl-4 sm:pl-0 pr-12 sm:pr-0 [overscroll-behavior-x:contain]"
      >
        {tabs.map((t) => {
          const isActive = t.match
            ? t.match(pathname)
            : defaultMatch
              ? defaultMatch(pathname, t)
              : pathname === t.href ||
                (t.href !== "/" && pathname.startsWith(`${t.href}/`));
          return (
            <Link
              key={t.href + t.label}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap px-3 py-2 -mb-px text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] border-b-2 transition-colors ${
                isActive
                  ? "border-accent text-ink-4"
                  : "border-transparent text-ink-3 hover:text-ink-4"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 bottom-0 w-10 sm:hidden bg-gradient-to-l from-ink-0 to-transparent"
      />
    </div>
  );
}
