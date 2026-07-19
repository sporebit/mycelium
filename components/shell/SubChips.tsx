"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "@/lib/nav/sections";

/**
 * Mobile-only sub-navigation. Derives the active section from the current
 * pathname and renders its subPages as a horizontally scrollable chip row.
 * Desktop uses the Sidebar's accordion for the same purpose.
 */
export function SubChips() {
  const pathname = usePathname();
  const section = SECTIONS.find(
    (s) =>
      pathname === s.baseRoute || pathname.startsWith(s.baseRoute + "/"),
  );
  if (!section) return null;

  return (
    <nav
      aria-label={`${section.label} pages`}
      className="lg:hidden -mx-4 sm:-mx-6 mb-4 overflow-x-auto no-scrollbar"
    >
      <ul className="inline-flex items-center gap-2 px-4 sm:px-6 snap-x snap-mandatory">
        {section.subPages.map((sp) => {
          const active =
            pathname === sp.href || pathname.startsWith(sp.href + "/");
          return (
            <li key={sp.href} className="snap-start shrink-0">
              <Link
                href={sp.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center px-3 py-1.5 rounded-v2-md text-[13px] transition-colors duration-[var(--dur-fast)] [transition-timing-function:var(--ease-out)] ${
                  active
                    ? "bg-glow-wash text-text-hi"
                    : "border border-hairline text-text-mid hover:text-text-hi"
                }`}
              >
                {sp.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
