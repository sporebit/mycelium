"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/dashboard/Mono";
import { KIND_VISUALS } from "@/lib/fitness/kind";
import { AddSessionModal } from "./AddSessionModal";
import type { CalendarPill } from "@/lib/fitness/calendar";
import type { Slot, TodayResponse } from "@/lib/fitness/types";

type Props = {
  date: string;
  pills: CalendarPill[];
  todayKey: string;
  programmeSessions: TodayResponse["programme_sessions"];
};

function backHrefForDate(date: string): string {
  return `/fitness/calendar?month=${date.slice(0, 7)}`;
}

function statusLabel(pill: CalendarPill): {
  text: string;
  cls: string;
} {
  if (pill.state === "completed")
    return { text: "COMPLETED", cls: "text-ok" };
  if (pill.state === "active")
    return { text: "ACTIVE", cls: "text-warn" };
  if (pill.state === "planned-future")
    return { text: "PLANNED", cls: "text-accent" };
  return { text: "MISSED", cls: "text-ink-3" };
}

function rowHref(pill: CalendarPill, dateKey: string, todayKey: string): string | null {
  if (pill.logged_session_id) return `/fitness/log/${pill.logged_session_id}`;
  if (pill.state === "planned-future" && dateKey === todayKey) {
    // Today's planned — link back to the today view to start it
    return "/fitness";
  }
  return null;
}

function fmtFullDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function CalendarDayView({ date, pills, todayKey, programmeSessions }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState<Slot | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={backHrefForDate(date)}
            aria-label="Back to month"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
          >
            ←
          </Link>
          <h1 className="font-[family-name:var(--font-display)] italic text-text-0 text-2xl">
            {fmtFullDate(date)}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen("morning")}
          className="px-3 h-9 inline-flex items-center rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-accent hover:text-text-0 hover:border-accent/60 transition-colors"
        >
          + ADD SESSION
        </button>
      </header>

      {pills.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-6 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            No sessions on this day.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen("morning")}
            className="mt-3 inline-flex items-center px-3 py-2 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-accent hover:text-text-0 hover:border-accent/60 transition-colors"
          >
            + ADD SESSION
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {pills.map((p) => {
            const kv = KIND_VISUALS[p.kind];
            const status = statusLabel(p);
            const href = rowHref(p, date, todayKey);
            const stats =
              p.state === "completed" && (p.sets !== null || p.minutes !== null)
                ? `${p.sets ?? 0} sets${
                    p.minutes !== null ? ` · ${p.minutes}m` : ""
                  }`
                : null;

            const inner = (
              <article
                className={`bg-ink-1 rounded-md p-4 flex items-center gap-3 transition-colors ${
                  href ? "hover:bg-ink-2/30 cursor-pointer" : ""
                } ${p.state === "planned-past-missed" ? "opacity-50" : ""}`}
              >
                <span aria-hidden className="text-2xl shrink-0">
                  {kv.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    {p.slot.toUpperCase()} · {kv.label}
                  </div>
                  <div className="text-base text-text-0 truncate">{p.name}</div>
                  {stats && (
                    <Mono className="text-[11px] text-ink-3 mt-0.5">{stats}</Mono>
                  )}
                </div>
                <Mono
                  className={`text-[11px] tracking-[0.18em] shrink-0 ${status.cls}`}
                >
                  {status.text}
                </Mono>
              </article>
            );

            return (
              <li key={p.id}>
                {href ? (
                  <Link href={href} className="block">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}

      {addOpen && (
        <AddSessionModal
          slot={addOpen}
          date={date}
          programmeSessions={programmeSessions}
          onClose={() => setAddOpen(null)}
          onSaved={() => {
            setAddOpen(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
