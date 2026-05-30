"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type WeekDay = {
  date: string;
  day_of_week: number;
  planned_count: number;
  logged_count: number;
  is_today: boolean;
};

type WeekSummary = {
  anchor: string;
  today: string;
  week_iso: string;
  days: WeekDay[];
};

const DOW_LABEL = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function fmtLongDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function DateSelector({
  currentDate,
  isToday,
}: {
  currentDate: string;
  isToday: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(currentDate);
  const [week, setWeek] = useState<WeekSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fitness/week-summary?anchor=${anchor}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: WeekSummary) => {
        if (cancelled) return;
        setWeek(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [anchor]);

  function navigateTo(date: string) {
    setOpen(false);
    if (week && date === week.today) {
      router.push("/fitness");
    } else {
      router.push(`/fitness/${date}`);
    }
  }

  function shiftWeek(delta: number) {
    setAnchor((a) => addDays(a, delta * 7));
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-ink-2 text-sm text-text-0 hover:border-ink-3 transition-colors font-[family-name:var(--font-display)] italic"
        >
          {fmtLongDate(currentDate)}
          {!isToday && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-warn font-[family-name:var(--font-mono)]">
              {currentDate < (week?.today ?? currentDate)
                ? "· PAST"
                : "· FUTURE"}
            </span>
          )}
          <span aria-hidden className="text-ink-3">
            ▾
          </span>
        </button>
        {!isToday && (
          <Link
            href="/fitness"
            className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
          >
            → TODAY
          </Link>
        )}
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute z-50 left-0 mt-2 w-[min(420px,calc(100vw-2rem))] rounded-md bg-ink-1 border border-ink-2 shadow-2xl p-3">
            <header className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => shiftWeek(-1)}
                aria-label="Previous week"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-3 hover:text-ink-4 hover:bg-ink-2/50"
              >
                ←
              </button>
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                {week ? `Week of ${week.days[0].date}` : "Week"}
              </span>
              <button
                type="button"
                onClick={() => shiftWeek(1)}
                aria-label="Next week"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-3 hover:text-ink-4 hover:bg-ink-2/50"
              >
                →
              </button>
            </header>
            <div className="grid grid-cols-7 gap-1">
              {(week?.days ?? Array.from({ length: 7 }, () => null)).map(
                (d, i) => {
                  if (!d) {
                    return (
                      <div
                        key={`ph-${i}`}
                        className="h-16 rounded-md bg-ink-2/30 animate-pulse"
                      />
                    );
                  }
                  const isSelected = d.date === currentDate;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => navigateTo(d.date)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-md border transition-colors ${
                        isSelected
                          ? "border-accent/60 bg-accent/15 text-accent"
                          : d.is_today
                            ? "border-accent/30 text-text-0 hover:bg-ink-2/40"
                            : "border-ink-2 text-text-1 hover:text-text-0 hover:bg-ink-2/40"
                      }`}
                      aria-current={isSelected ? "date" : undefined}
                    >
                      <span className="text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)]">
                        {DOW_LABEL[i]}
                      </span>
                      <span className="text-base font-[family-name:var(--font-mono)] tabular-nums">
                        {d.date.slice(8, 10)}
                      </span>
                      <span className="flex items-center gap-0.5 h-2">
                        {Array.from({
                          length: Math.min(3, d.planned_count + d.logged_count),
                        }).map((_, i) => (
                          <span
                            key={i}
                            className={`h-1 w-1 rounded-full ${
                              i < d.logged_count
                                ? "bg-ok"
                                : "bg-accent/60"
                            }`}
                          />
                        ))}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
