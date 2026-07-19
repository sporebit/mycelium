"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Route-content fade. Re-keys on pathname so React remounts the wrapper
 * on navigation, firing the CSS animation. Sidebar/TabBar live outside
 * this wrapper so chrome persists across route changes.
 *
 * Motion respect is done in globals.css:
 *   [data-motion="off"]     → no animation
 *   [data-motion="reduced"] → shorter opacity-only, no rise
 */
export function PageFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-fade-in">
      {children}
    </div>
  );
}
