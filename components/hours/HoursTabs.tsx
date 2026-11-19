"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const HOURS_BASE = "/organisation/hours";

/** The tracker's own pages (spec §5). Added as each build part lands. */
export const HOURS_TABS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "Log", href: `${HOURS_BASE}/log` },
  { label: "Backlog", href: `${HOURS_BASE}/backlog` },
  { label: "History", href: `${HOURS_BASE}/history` },
  { label: "Settings", href: `${HOURS_BASE}/settings` },
];

export function HoursTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hours pages" className="-mx-4 sm:-mx-6 mb-4 overflow-x-auto no-scrollbar">
      <ul className="inline-flex items-center gap-2 px-4 sm:px-6">
        {HOURS_TABS.map((t) => {
          const active = t.href === HOURS_BASE ? pathname === HOURS_BASE : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center px-3 py-1.5 rounded-v2-md text-[13px] transition-colors ${
                  active ? "bg-glow-wash text-text-hi" : "border border-hairline text-text-mid hover:text-text-hi"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
