"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";

type Tab = {
  label: string;
  href: string;
  /** Returns true when this tab represents the current pathname. */
  match: (pathname: string) => boolean;
  /** Which viewports show this tab. */
  visibility: "always" | "mobile" | "desktop";
};

const TABS: Tab[] = [
  {
    label: "COMPOST",
    href: "/compost",
    match: (p) => p === "/compost" || p.startsWith("/compost/"),
    visibility: "always",
  },
  {
    label: "FITNESS",
    href: "/fitness",
    match: (p) => p === "/fitness" || p.startsWith("/fitness/"),
    visibility: "always",
  },
  {
    label: "STROMA",
    href: "/stroma",
    match: (p) => p === "/stroma" || p.startsWith("/stroma/"),
    visibility: "always",
  },
  {
    label: "FINANCE",
    href: "/finance",
    match: (p) => p === "/finance" || p.startsWith("/finance/"),
    visibility: "desktop",
  },
  {
    label: "HEALTH",
    href: "/health",
    // Health is a top-level section alongside Compost/Fitness/Stroma —
    // nutrition + body + pain live here, all worth a one-tap reach.
    match: (p) =>
      p === "/health" ||
      p.startsWith("/health/") ||
      p === "/nutrition" ||
      p.startsWith("/nutrition/"),
    visibility: "always",
  },
  {
    label: "JOURNAL",
    href: "/journal",
    match: (p) => p === "/journal" || p.startsWith("/journal/"),
    visibility: "desktop",
  },
  {
    label: "REVIEW",
    href: "/review",
    match: (p) => p === "/review" || p.startsWith("/review/"),
    visibility: "desktop",
  },
  {
    label: "MORE",
    href: "/more",
    match: (p) => p === "/more" || p.startsWith("/more/"),
    visibility: "mobile",
  },
];

function visibilityClass(v: Tab["visibility"]): string {
  if (v === "always") return "";
  if (v === "desktop") return "hidden lg:inline-flex";
  return "lg:hidden"; // mobile-only
}

/**
 * Single unified top bar — Mycelium wordmark on the left, primary nav on the
 * right. Desktop (≥1024px) shows every navigable section inline. Mobile
 * keeps a slim bar with the three primary sections plus a MORE link to the
 * full /more index for the remaining sections.
 */
export function TopRail() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 bg-ink-1/85 backdrop-blur-xl shadow-[0_1px_0_0_var(--ink-2)]">
      <div className="mx-auto max-w-[1400px] flex items-center justify-between gap-3 px-4 sm:px-6 min-h-[52px]">
        <Wordmark />
        <nav aria-label="Primary" className="flex items-center gap-0.5 sm:gap-1">
          {TABS.map((t) => {
            const isActive = t.match(pathname);
            return (
              <Link
                key={t.label}
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={`${visibilityClass(t.visibility)} inline-flex items-center justify-center min-h-[44px] px-2 sm:px-3 text-[10px] sm:text-xs font-[family-name:var(--font-mono)] tracking-[0.04em] uppercase rounded-md transition-colors ${
                  isActive
                    ? "bg-ink-2 text-accent"
                    : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/70"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
