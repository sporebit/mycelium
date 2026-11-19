import type { ReactNode } from "react";
import { HoursTabs } from "@/components/hours/HoursTabs";

/** The Four-Day Week Tracker (claude/four-day-week-spec.md). Tabs across its own pages. */
export default function HoursLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <HoursTabs />
      {children}
    </div>
  );
}
