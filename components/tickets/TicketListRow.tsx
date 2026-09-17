"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Task } from "@/lib/types/task";
import {
  TIME_WINDOW_LABEL,
  TOOL_GLYPH,
  WHERE_GLYPH,
  WHERE_LABEL,
  type TimeWindow,
  type WhereCtx,
} from "@/lib/tickets/categories";
import { CategoryChip } from "./CategoryChip";

export type TicketRowData = Task & { blocked_by?: string[] };

export function ticketHref(t: Pick<Task, "id" | "ticket_key">): string {
  return t.ticket_key ? `/organisation/tickets/${t.ticket_key}` : `/organisation/tasks?task=${t.id}`;
}

export function fmtDay(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Where · Tool · Time window · Points as glyphs — the "why is this here?" strip. */
export function FacetStrip({ t, className = "" }: { t: Task; className?: string }) {
  const where = (t.where_ctx ?? "anywhere") as WhereCtx;
  const tools = (t.tools ?? ["none"]).filter((x) => x !== "none");
  const win = (t.time_window ?? "anytime") as TimeWindow;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] text-ink-3 ${className}`}
      title={[
        WHERE_LABEL[where] ?? where,
        tools.length ? `Tools: ${tools.join(", ")}` : "No tools",
        TIME_WINDOW_LABEL[win] ?? win,
        t.points ? `${t.points} pts` : "",
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      {where !== "anywhere" && <span>{WHERE_GLYPH[where]}</span>}
      {tools.map((tool) => (
        <span key={tool}>{TOOL_GLYPH[tool] ?? `#${tool}`}</span>
      ))}
      {win !== "anytime" && (
        <span className="rounded-sm bg-ink-2/60 px-1 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.1em]">
          {TIME_WINDOW_LABEL[win]}
        </span>
      )}
      {t.points != null && (
        <span className="font-[family-name:var(--font-mono)] text-[10px]">{t.points}</span>
      )}
    </span>
  );
}

/**
 * One ticket row. Used by every GTD tab and the Now view. `action` is an
 * optional trailing control (a Done tick on Now, a Clarify button on Inbox).
 */
export function TicketListRow({
  t,
  simple = false,
  showCategory = true,
  action,
  selectable = false,
  selected = false,
  onToggleSelect,
  onLongPress,
}: {
  t: TicketRowData;
  simple?: boolean;
  showCategory?: boolean;
  action?: React.ReactNode;
  /** Bulk mode (spec §12: long-press = bulk): a checkbox replaces navigation. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onLongPress?: () => void;
}) {
  const closed = t.category === "done" || t.category === "cancelled" || !!t.completed_at;
  const deadline = t.deadline_on ?? t.due_date ?? null;
  const scheduled = t.scheduled_on ?? (t.scheduled_at ? t.scheduled_at.slice(0, 10) : null);
  const blocked = (t.blocked_by?.length ?? 0) > 0;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = () => {
    if (!onLongPress) return;
    pressTimer.current = setTimeout(() => onLongPress(), 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  return (
    <li className="flex items-center gap-2">
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.()}
          aria-label={`Select ${t.ticket_key ?? t.title}`}
          className="h-4 w-4 shrink-0 accent-[var(--glow-0)]"
        />
      )}
      <Link
        href={ticketHref(t)}
        onClick={(e) => {
          if (selectable) {
            e.preventDefault();
            onToggleSelect?.();
          }
        }}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => {
          if (onLongPress) e.preventDefault();
        }}
        className={`group flex min-w-0 flex-1 items-center gap-3 rounded-v2-md border px-3 py-2 transition-colors hover:bg-surface-2 ${
          selected ? "border-glow-2/50 bg-glow-2/10" : "border-hairline bg-surface-1"
        }`}
      >
        <span className="w-[68px] shrink-0 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.08em] text-glow-2">
          {t.ticket_key ?? "—"}
        </span>
        {showCategory && (
          <CategoryChip category={t.category} name={t.status_name} simple={simple} />
        )}
        {t.urgent && (
          <span className="shrink-0 text-warn" title="Urgent">
            !
          </span>
        )}
        <span
          className={`min-w-0 flex-1 truncate text-sm ${closed ? "text-ink-3 line-through" : "text-ink-4"}`}
        >
          {t.title}
        </span>
        {blocked && (
          <span
            className="hidden shrink-0 text-[10px] uppercase tracking-[0.12em] text-warn sm:inline"
            title={`Blocked by ${(t.blocked_by ?? []).join(", ")}`}
          >
            blocked
          </span>
        )}
        {t.waiting_on_name && (
          <span className="hidden max-w-[120px] shrink-0 truncate text-[11px] text-warn sm:inline">
            ⏳ {t.waiting_on_name}
          </span>
        )}
        {t.assignee_name && (
          <span className="hidden max-w-[110px] shrink-0 truncate text-[11px] text-glow-2 sm:inline" title="Assignee">
            @{t.assignee_name}
          </span>
        )}
        {t.project_name && (
          <span className="hidden max-w-[140px] shrink-0 truncate text-[11px] text-ink-3 md:inline">
            {t.project_name}
          </span>
        )}
        <FacetStrip t={t} className="hidden md:inline-flex" />
        {(deadline || scheduled) && (
          <span
            className="shrink-0 text-[11px] font-[family-name:var(--font-mono)] text-ink-3"
            title={deadline ? `Deadline ${deadline}` : `Scheduled ${scheduled}`}
          >
            {deadline ? "⚑ " : "▸ "}
            {fmtDay(deadline ?? scheduled)}
          </span>
        )}
      </Link>
      {action}
    </li>
  );
}
