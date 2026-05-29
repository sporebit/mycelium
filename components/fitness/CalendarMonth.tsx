"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/dashboard/Mono";
import { KIND_VISUALS } from "@/lib/fitness/kind";
import type { CalendarDay, CalendarPill } from "@/lib/fitness/calendar";

type Props = {
  year: number;
  month: number; // 1-12
  todayKey: string;
  cells: string[]; // 42 YYYY-MM-DD entries
  days: Record<string, CalendarDay>;
};

const DOW_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number): {
  year: number;
  month: number;
} {
  let m = month + delta;
  let y = year;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

function pillClasses(state: CalendarPill["state"], kindClass: string): string {
  if (state === "completed") return `${kindClass} text-text-0`;
  if (state === "active") return `${kindClass} text-text-0 ring-1 ring-glow-2`;
  if (state === "planned-future")
    return "border border-current/50 bg-transparent";
  return "border border-dashed border-current/30 bg-transparent opacity-40";
}

export function CalendarMonth({ year, month, todayKey, cells, days }: Props) {
  const router = useRouter();
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const todayMonth = useMemo(() => {
    const [ty, tm] = todayKey.split("-").map(Number);
    return monthParam(ty, tm);
  }, [todayKey]);

  // Arrow-key month navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        router.push(`/fitness/calendar?month=${monthParam(prev.year, prev.month)}`);
      } else if (e.key === "ArrowRight") {
        router.push(`/fitness/calendar?month=${monthParam(next.year, next.month)}`);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, prev.year, prev.month, next.year, next.month]);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link
            href={`/fitness/calendar?month=${monthParam(prev.year, prev.month)}`}
            aria-label="Previous month"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
          >
            ←
          </Link>
          <h1 className="font-[family-name:var(--font-display)] italic text-text-0 text-2xl">
            {monthLabel(year, month)}
          </h1>
          <Link
            href={`/fitness/calendar?month=${monthParam(next.year, next.month)}`}
            aria-label="Next month"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
          >
            →
          </Link>
          {monthParam(year, month) !== todayMonth && (
            <Link
              href="/fitness/calendar"
              className="ml-2 px-3 h-9 inline-flex items-center rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
            >
              TODAY
            </Link>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Calendar view"
          className="flex rounded-md border border-ink-2 overflow-hidden text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          <span
            role="tab"
            aria-selected="true"
            className="px-3 py-2 bg-accent/15 text-accent"
          >
            MONTH
          </span>
          <Link
            href="/fitness"
            role="tab"
            aria-selected="false"
            className="px-3 py-2 text-ink-3 hover:text-ink-4 hover:bg-ink-2/40 transition-colors"
          >
            WEEK
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-px bg-ink-2 rounded-md overflow-hidden">
        {DOW_LABELS.map((d) => (
          <div
            key={d}
            className="bg-ink-1 px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-center"
          >
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const day = days[cell] ?? { date: cell, pills: [] };
          const isInMonth = Number(cell.slice(5, 7)) === month;
          const isToday = cell === todayKey;
          const visible = day.pills.slice(0, 3);
          const overflow = day.pills.length - visible.length;
          const dayNum = cell.slice(8, 10);

          return (
            <Link
              key={cell}
              href={`/fitness/calendar/${cell}`}
              prefetch={false}
              className={`group bg-ink-1 min-h-[96px] sm:min-h-[112px] p-1.5 sm:p-2 flex flex-col gap-1 transition-colors hover:bg-ink-2/40 relative ${
                isInMonth ? "" : "opacity-40"
              } ${isToday ? "ring-2 ring-glow-2 z-10" : ""}`}
            >
              <Mono
                className={`text-[11px] leading-none ${
                  isToday ? "text-text-0 font-bold" : "text-ink-3"
                }`}
              >
                {dayNum}
              </Mono>
              <div className="flex flex-col gap-0.5 min-h-0">
                {visible.map((p) => {
                  const kv = KIND_VISUALS[p.kind];
                  return (
                    <span
                      key={p.id}
                      className={`flex items-center gap-1 px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-[family-name:var(--font-mono)] tracking-[0.05em] truncate ${kv.textClass} ${pillClasses(p.state, kv.bgClass)}`}
                      title={`${kv.label} · ${p.name}${
                        p.state === "planned-past-missed" ? " · missed" : ""
                      }`}
                    >
                      <span aria-hidden>{kv.icon}</span>
                      <span className="hidden sm:inline truncate">
                        {p.name.length > 12 ? `${p.name.slice(0, 12)}…` : p.name}
                      </span>
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] px-1">
                    +{overflow} more
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-accent/15 border border-accent/40" />
          completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-accent/15 ring-1 ring-glow-2 border border-accent/40" />
          active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-current/50" />
          planned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-dashed border-current/30 opacity-40" />
          missed
        </span>
      </div>
    </section>
  );
}
