"use client";

import { usePathname } from "next/navigation";
import { ContextSwitcher } from "./ContextSwitcher";

/**
 * Renders the ContextSwitcher only on the Compost tasks surface. The
 * NOW filter is task-list specific; showing it on people / projects /
 * captures / etc. implied functionality that doesn't exist there. The
 * underlying state (device, where, energy, tag) still persists in
 * localStorage so returning to the tasks list picks up where the user
 * left off.
 */
export function ContextSwitcherGate() {
  const pathname = usePathname();
  const visible =
    pathname === "/organisation/tasks" || pathname.startsWith("/organisation/tasks/");
  if (!visible) return null;
  return (
    <div className="w-full border-b border-ink-2/40 bg-ink-1/40">
      <ContextSwitcher />
    </div>
  );
}
