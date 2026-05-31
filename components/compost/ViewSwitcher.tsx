"use client";

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

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: CrmView;
  onChange: (v: CrmView) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-ink-2 bg-ink-0/40 p-0.5 overflow-x-auto max-w-full">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          className={`px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] rounded-md transition-colors whitespace-nowrap ${
            value === v.id
              ? "bg-ink-2 text-ink-4"
              : "text-ink-3 hover:text-ink-4"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
