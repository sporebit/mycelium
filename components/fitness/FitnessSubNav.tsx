"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Today", href: "/fitness" },
  { label: "Workouts", href: "/fitness/workouts" },
  { label: "Exercises", href: "/fitness/exercises" },
  { label: "Programmes", href: "/fitness/programmes" },
  { label: "History", href: "/fitness/history" },
  { label: "Body", href: "/fitness/body" },
  { label: "Coach", href: "/fitness/coach" },
];

export function FitnessSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto h-10 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4 border-b border-ink-2/40">
      {TABS.map((t) => {
        const active =
          t.href === "/fitness"
            ? pathname === "/fitness" || pathname === "/fitness/"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className="shrink-0 px-3 h-10 inline-flex items-center text-[11px] font-[family-name:var(--font-mono)] tracking-[0.08em] uppercase transition-colors border-b-2"
            style={{
              color: active ? "#84f5b8" : undefined,
              opacity: active ? 1 : 0.38,
              borderBottomColor: active ? "#84f5b8" : "transparent",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
