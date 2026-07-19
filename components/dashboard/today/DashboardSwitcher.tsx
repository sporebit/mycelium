"use client";

import { SegmentedControl } from "@/components/ui";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { NowBlock } from "./NowBlock";
import { TimelineRail } from "./TimelineRail";
import { GlanceRow } from "./GlanceRow";
import { DashboardGrid } from "../DashboardGrid";

const OPTIONS = [
  { value: "today", label: "Today" },
  { value: "everything", label: "Everything" },
];

export function DashboardSwitcher() {
  const { prefs, setPrefs } = useUiPrefs();
  const view = prefs.dashboard_view;

  return (
    <div>
      <div className="mb-4">
        <SegmentedControl
          options={OPTIONS}
          value={view}
          onChange={(v) =>
            void setPrefs({
              dashboard_view: v as "today" | "everything",
            })
          }
          ariaLabel="Dashboard view"
        />
      </div>
      {view === "today" ? (
        <>
          <NowBlock />
          <TimelineRail />
          <GlanceRow />
        </>
      ) : (
        <DashboardGrid />
      )}
    </div>
  );
}
