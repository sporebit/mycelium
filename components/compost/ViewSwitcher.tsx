"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";

export type CrmView =
  | "list"
  | "smart"
  | "kanban"
  | "category"
  | "status"
  | "table"
  | "calendar";

// List, Smart, Category and Table are hidden (Phil, 2026-09-23); their
// components stay so a view can come back by adding it here.
const VIEWS: { id: CrmView; label: string }[] = [
  { id: "kanban", label: "URGENCY" },
  { id: "status", label: "KANBAN" },
  { id: "calendar", label: "CALENDAR" },
];

export const DEFAULT_VIEW: CrmView = "kanban";

/** A stored preference or ?view= link to a hidden view opens the default instead. */
export function visibleView(v: string | null | undefined): CrmView {
  return VIEWS.some((x) => x.id === v) ? (v as CrmView) : DEFAULT_VIEW;
}

const OPTIONS = VIEWS.map((v) => ({ value: v.id, label: v.label }));

/**
 * The SegmentedControl keeps its natural width inside a horizontally
 * scrollable wrapper, so labels never shrink to illegibility on a phone. The sliding pill measures against the control itself,
 * not the wrapper, so scrolling does not disturb it.
 */
export function ViewSwitcher({
  value,
  onChange,
}: {
  value: CrmView;
  onChange: (v: CrmView) => void;
}) {
  return (
    <div className="overflow-x-auto max-w-full -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <SegmentedControl
        options={OPTIONS}
        value={value}
        onChange={(v) => onChange(v as CrmView)}
        size="sm"
        ariaLabel="Task view"
      />
    </div>
  );
}
