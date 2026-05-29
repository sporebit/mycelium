"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";

type Tab = {
  label: string;
  href: string;
  /** Returns true when this tab represents the current pathname. */
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    label: "COMPOST",
    href: "/compost",
    match: (p) => p === "/compost" || p.startsWith("/compost/"),
  },
  {
    label: "FITNESS",
    href: "/fitness",
    match: (p) => p === "/fitness" || p.startsWith("/fitness/"),
  },
  {
    label: "BRAIN",
    href: "/brain",
    match: (p) => p === "/brain" || p.startsWith("/brain/"),
  },
  {
    label: "MORE",
    href: "/more",
    match: (p) => p === "/more" || p.startsWith("/more/"),
  },
];

/**
 * Single unified top bar — Mycelium wordmark on the left routes to /,
 * four nav items on the right. Identical markup on mobile and desktop;
 * sizing tightens slightly under sm to fit a 380px viewport.
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
                className={`inline-flex items-center justify-center min-h-[44px] px-2 sm:px-3 text-[10px] sm:text-xs font-[family-name:var(--font-mono)] tracking-[0.04em] uppercase rounded-md transition-colors ${
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
