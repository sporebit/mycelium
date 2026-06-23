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
    <div className="relative -mx-4 sm:-mx-6 mb-4">
      <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto h-10 px-4 sm:px-6 pr-12 border-b border-ink-2/40 [overscroll-behavior-x:contain]">
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
                opacity: active ? 1 : 0.6,
                borderBottomColor: active ? "#84f5b8" : "transparent",
              }}
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
