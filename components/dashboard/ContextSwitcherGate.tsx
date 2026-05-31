"use client";

import { usePathname } from "next/navigation";
import { ContextSwitcher } from "./ContextSwitcher";

/**
 * Renders the ContextSwitcher only on /compost/* routes — the NOW
 * filter is task-specific, so showing the bar on Fitness / Stroma /
 * Health would imply functionality that doesn't exist there. The
 * underlying state (device, where, energy, tag) still persists in
 * localStorage between visits, so returning to Compost picks up where
 * the user left off.
 */
export function ContextSwitcherGate() {
  const pathname = usePathname();
  const visible = pathname === "/compost" || pathname.startsWith("/compost/");
  if (!visible) return null;
  return (
    <div className="mx-auto w-full max-w-[1400px] border-b border-ink-2/40 bg-ink-1/40">
      <ContextSwitcher />
    </div>
  );
}
