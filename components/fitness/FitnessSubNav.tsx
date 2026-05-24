"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "TODAY", href: "/fitness" },
  { label: "PROGRAMMES", href: "/fitness/programmes" },
  { label: "PHASES", href: "/fitness/phases" },
  { label: "BODY", href: "/fitness/body" },
  { label: "HISTORY", href: "/fitness/history" },
];

export function FitnessSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 border-b border-ink-2 mb-4">
      {TABS.map((t) => {
        const isActive =
          pathname === t.href ||
          (t.href !== "/fitness" && pathname.startsWith(t.href));
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 -mb-px text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] border-b-2 transition-colors ${
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
