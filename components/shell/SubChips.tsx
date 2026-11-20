"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionForPath } from "@/lib/nav/sections";

/**
 * Sub-navigation as a chip row. Derives the active section from the current
 * pathname and renders its subPages, horizontally scrollable. In the
 * classic shell it is for phones only (desktop has the Sidebar's
 * accordion); in the new shell, which has no sidebar, it shows on desktop
 * too (`desktop`).
 */
export function SubChips({ desktop = false }: { desktop?: boolean } = {}) {
  const pathname = usePathname();
  const section = sectionForPath(pathname);
  if (!section) return null;

  return (
    <nav
      aria-label={`${section.label} pages`}
      className={`${desktop ? "" : "lg:hidden "}-mx-4 sm:-mx-6 mb-4 overflow-x-auto no-scrollbar`}
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
