"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
  match: (p: string) => boolean;
};

const TABS: Tab[] = [
  {
    label: "OVERVIEW",
    href: "/health",
    match: (p) => p === "/health",
  },
  {
    label: "NUTRITION",
    href: "/health/nutrition",
    match: (p) => p === "/health/nutrition" || p.startsWith("/health/nutrition/"),
  },
  {
    // Body metrics live under /fitness/body — we surface them as a Health
    // tab without duplicating the route. The active match handles both
    // surfaces.
    label: "BODY",
    href: "/fitness/body",
    match: (p) => p === "/fitness/body" || p === "/health/body",
  },
  {
    label: "PAIN",
    href: "/health/pain",
    match: (p) => p === "/health/pain" || p.startsWith("/health/pain/"),
  },
];

export function HealthSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 border-b border-ink-2 mb-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const isActive = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
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
  );
}
