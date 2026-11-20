"use client";

/**
 * The frame around every page, in whichever shell the person has chosen.
 *
 *   classic  the sidebar on desktop, the tab bar on a phone.
 *   new      the top menu bar on desktop (claude/ui-direction.md §3), the
 *            same tab bar on a phone. Inner pages are not restyled: they
 *            sit under the bar as they sat beside the sidebar, with their
 *            sub-pages as a chip row.
 *
 * Home may ask for no padding (`bleed`) so a Home view can run to the edges.
 */
import type { ReactNode } from "react";
import { PageFade } from "./PageFade";
import { useShellKind } from "./ShellPref";
import { Sidebar } from "./Sidebar";
import { SubChips } from "./SubChips";
import { TopMenu } from "./TopMenu";

export function ShellFrame({ children, bleed = false }: { children: ReactNode; bleed?: boolean }) {
  const kind = useShellKind();
  if (kind === "new") {
    return (
      <div className="flex min-w-0 flex-1 flex-col" data-shell="new">
        <TopMenu />
        <main className={bleed ? "min-w-0 flex-1 w-full px-4 py-4 pb-20 sm:px-6 lg:p-2 lg:pb-2" : "min-w-0 flex-1 w-full px-4 py-4 pb-20 sm:px-6 sm:py-6 lg:pb-6"}>
          <SubChips desktop />
          <PageFade>{children}</PageFade>
        </main>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col lg:flex-row min-w-0" data-shell="classic">
      <Sidebar />
      {/* No max-width — the kanban view alone needs 10 columns wide,
          which exceeded the prior 1400px clamp and forced horizontal
          page scroll. Pages that want a narrower reading column can
          set their own max-width inside `children`. */}
      <main className="flex-1 w-full px-4 sm:px-6 py-4 sm:py-6 pb-20 lg:pb-6 min-w-0">
        <SubChips />
        <PageFade>{children}</PageFade>
      </main>
    </div>
  );
}
