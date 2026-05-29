"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon } from "@/components/icons/nav/HomeIcon";
import { CompostIcon } from "@/components/icons/nav/CompostIcon";
import { FitnessIcon } from "@/components/icons/nav/FitnessIcon";
import { BrainIcon } from "@/components/icons/nav/BrainIcon";
import { MoreIcon } from "@/components/icons/nav/MoreIcon";
import type { NavIconProps } from "@/components/icons/nav/types";
import type { ComponentType } from "react";

type Tab = {
  label: string;
  href: string;
  Icon: ComponentType<NavIconProps>;
  /** Returns true if this tab is the best match for the current pathname. */
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    label: "Home",
    href: "/",
    Icon: HomeIcon,
    match: (p) => p === "/",
  },
  {
    label: "Compost",
    href: "/compost",
    Icon: CompostIcon,
    match: (p) => p === "/compost" || p.startsWith("/compost/"),
  },
  {
    label: "Fitness",
    href: "/fitness",
    Icon: FitnessIcon,
    match: (p) => p === "/fitness" || p.startsWith("/fitness/"),
  },
  {
    label: "Brain",
    href: "/brain",
    Icon: BrainIcon,
    match: (p) => p === "/brain" || p.startsWith("/brain/"),
  },
  {
    label: "More",
    href: "/more",
    Icon: MoreIcon,
    // Anything not matched by an earlier tab falls through to More so the
    // bar always highlights *something* (e.g. /finance, /journal, /review).
    match: () => true,
  },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const activeIdx = TABS.findIndex((t) => t.match(pathname));

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-ink-1/95 backdrop-blur-xl border-t border-ink-2"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map((tab, i) => {
          const active = i === activeIdx;
          const Icon = tab.Icon;
          return (
            <li key={tab.label} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 min-h-[56px] transition-colors ${
                  active
                    ? "text-glow-0"
                    : "text-ink-3 hover:text-ink-4"
                }`}
              >
                <Icon size={22} active={active} ariaLabel={tab.label} />
                <span className="text-[10px] font-[family-name:var(--font-mono)] tracking-[0.08em] uppercase">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
