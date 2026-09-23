"use client";

import { todayLondon, whenLabel, type WhenSubject } from "@/lib/tickets/when";

/**
 * OVERDUE (tickets spec §18 R5): a red pill wherever a row, card or page
 * shows a ticket with a past deadline. With `window`, the When label shows
 * while the date is still ahead, so the pill doubles as the date cell.
 */
export function OverduePill({
  t,
  window = false,
  className = "",
  today = todayLondon(),
}: {
  t: WhenSubject;
  /** also show the window label ("Within a week", "Weekend 26 Sep", "Due 5 Nov") when not overdue */
  window?: boolean;
  className?: string;
  today?: string;
}) {
  const label = whenLabel(t, today);
  if (!label) return null;
  const base = "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)]";
  if (label.kind === "overdue") {
    return (
      <span className={`${base} border-danger/40 bg-danger/15 text-danger ${className}`} title={`Deadline ${label.days} day${label.days === 1 ? "" : "s"} ago`}>
        Overdue{label.days > 0 ? ` · ${label.days}d` : ""}
      </span>
    );
  }
  if (!window) return null;
  if (label.kind === "someday") {
    return <span className={`${base} border-ink-2 bg-ink-2 text-ink-3 ${className}`}>someday</span>;
  }
  return (
    <span className={`${base} border-hairline bg-surface-2 text-ink-3 normal-case tracking-normal ${className}`} title={`Deadline ${label.date}`}>
      {label.text}
    </span>
  );
}
