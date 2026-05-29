import type { ReactNode } from "react";
import { TopRail } from "./TopRail";
import { GlobalSearch } from "./GlobalSearch";
import { FloatingCapture } from "./FloatingCapture";

/**
 * The Shell wraps every page with the single unified TopRail nav.
 *
 * The `active` prop is preserved on the type for callsite compatibility,
 * but TopRail now derives the active tab from usePathname() rather than
 * relying on this hint. Existing pages can keep passing `active="…"` —
 * it's just ignored.
 */
export function Shell({
  active: _active = "HOME",
  left,
  centre,
  right,
  children,
}: {
  active?: string;
  left?: ReactNode;
  centre?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  void _active;
  return (
    <div className="min-h-screen flex flex-col">
      <TopRail />

      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-4 sm:py-6">
        {children ? (
          children
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_360px] gap-4">
            <div className="flex flex-col gap-4 min-w-0">{left}</div>
            <div className="flex flex-col gap-4 min-w-0">{centre}</div>
            <div className="flex flex-col gap-4 min-w-0">{right}</div>
          </div>
        )}
      </main>

      <GlobalSearch />
      <FloatingCapture />
    </div>
  );
}
