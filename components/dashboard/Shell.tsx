import type { ReactNode } from "react";
import { GlobalSearch } from "./GlobalSearch";
import { FloatingCapture } from "./FloatingCapture";
import { ContextSwitcherGate } from "./ContextSwitcherGate";
import { ApiErrorToast } from "@/components/ui";
import { Sidebar } from "@/components/shell/Sidebar";
import { TabBar } from "@/components/shell/TabBar";
import { SubChips } from "@/components/shell/SubChips";
import { PageFade } from "@/components/shell/PageFade";

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
      <ContextSwitcherGate />

      <div className="flex-1 flex flex-col lg:flex-row min-w-0">
        <Sidebar />
        {/* No max-width — the kanban view alone needs 10 columns wide,
            which exceeded the prior 1400px clamp and forced horizontal
            page scroll. Pages that want a narrower reading column can
            set their own max-width inside `children`. */}
        <main className="flex-1 w-full px-4 sm:px-6 py-4 sm:py-6 pb-20 lg:pb-6 min-w-0">
          <SubChips />
          <PageFade>
            {children ? (
              children
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_360px] gap-4 mx-auto max-w-[1400px]">
                <div className="flex flex-col gap-4 min-w-0">{left}</div>
                <div className="flex flex-col gap-4 min-w-0">{centre}</div>
                <div className="flex flex-col gap-4 min-w-0">{right}</div>
              </div>
            )}
          </PageFade>
        </main>
      </div>

      <TabBar />
      <GlobalSearch />
      <FloatingCapture />
      <ApiErrorToast />
    </div>
  );
}
