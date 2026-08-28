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

const VIEWS: { id: CrmView; label: string }[] = [
  { id: "list", label: "LIST" },
  { id: "smart", label: "SMART" },
  { id: "kanban", label: "URGENCY" },
  { id: "status", label: "KANBAN" },
  { id: "category", label: "CATEGORY" },
  { id: "table", label: "TABLE" },
  { id: "calendar", label: "CALENDAR" },
];

const OPTIONS = VIEWS.map((v) => ({ value: v.id, label: v.label }));

/**
 * Seven segments need roughly 630px, so they sit comfortably on desktop but
 * cannot fit a 390px phone. Rather than shrink the labels to illegibility,
 * the SegmentedControl keeps its natural width inside a horizontally
 * scrollable wrapper. The sliding pill measures against the control itself,
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
