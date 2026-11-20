"use client";

import Link from "next/link";
import type { Tab } from "@/lib/settings/tabs";

/**
 * The sub-sections of a settings page as a chip row (MYC-190). Each chip is
 * a link, so the chosen tab is in the URL: it survives a reload, can be
 * linked to, and the reauth round trip comes back to it. The same row
 * serves desktop and touch; it scrolls sideways when it does not fit.
 */
export function SubNav({ tabs, active, label }: { tabs: Tab[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 sm:mx-0 overflow-x-auto no-scrollbar">
      <ul className="inline-flex items-center gap-2 px-4 sm:px-0">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key} className="shrink-0">
              <Link
                href={t.href}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center px-3 py-1.5 rounded-v2-md text-[13px] transition-colors duration-[var(--dur-fast)] [transition-timing-function:var(--ease-out)] ${
                  on ? "bg-glow-wash text-text-hi" : "border border-hairline text-text-mid hover:text-text-hi"
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
