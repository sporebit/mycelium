"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "OVERVIEW", href: "/finance" },
  { label: "SNAPSHOT", href: "/finance/snapshot" },
];

export function FinanceSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 border-b border-ink-2 mb-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const isActive =
          t.href === "/finance"
            ? pathname === "/finance"
            : pathname === t.href || pathname.startsWith(`${t.href}/`);
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
