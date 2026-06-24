"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type DailyLog = { id: string; taken_at: string };

type DailyItem = {
  id: string;
  name: string;
  dose: string;
  form: string;
  brand: string | null;
  fasted: boolean;
  with_food: boolean;
  timing_notes: string | null;
  log: DailyLog | null;
};

type DailySlot = {
  slot: string;
  label: string;
  items: DailyItem[];
};

type DailyData = {
  date: string;
  slots: DailySlot[];
  progress: { taken: number; total: number };
};

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
    new Date()
  );
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DailyChecklist() {
  const [date, setDate] = useState(todayKey);
  const [data, setData] = useState<DailyData | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const isToday = date === todayKey();

  function changeDate(d: string) {
    setDate(d);
    setData(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/supplements/daily?date=${date}`)
      .then((r) => r.json())
      .then((j: DailyData) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function toggle(item: DailyItem, slot: string) {
    if (toggling.has(item.id)) return;
    setToggling((s) => new Set(s).add(item.id));

    try {
      if (item.log) {
        const res = await fetch(
          `/api/supplements/${item.id}/log/${item.log.id}`,
          { method: "DELETE" }
        );
        if (!res.ok) return;
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            progress: { ...prev.progress, taken: prev.progress.taken - 1 },
            slots: prev.slots.map((s) => ({
              ...s,
              items: s.items.map((i) =>
                i.id === item.id ? { ...i, log: null } : i
              ),
            })),
          };
        });
      } else {
        const res = await fetch(`/api/supplements/${item.id}/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, timing_slot: slot }),
        });
        if (!res.ok) return;
        const { log } = (await res.json()) as { log: DailyLog };
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            progress: { ...prev.progress, taken: prev.progress.taken + 1 },
            slots: prev.slots.map((s) => ({
              ...s,
              items: s.items.map((i) =>
                i.id === item.id ? { ...i, log } : i
              ),
            })),
          };
        });
      }
    } finally {
      setToggling((s) => {
        const next = new Set(s);
        next.delete(item.id);
        return next;
      });
    }
  }

  const pct =
    data && data.progress.total > 0
      ? Math.round((data.progress.taken / data.progress.total) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Date navigation */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => changeDate(shiftDate(date, -1))}
          className="p-1.5 rounded-md text-ink-3 hover:text-ink-4 hover:bg-ink-1 transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-sm text-ink-4 font-[family-name:var(--font-mono)] tracking-[0.08em] min-w-[140px] text-center">
          {fmtDate(date)}
        </span>
        <button
          type="button"
          onClick={() => changeDate(shiftDate(date, 1))}
          className="p-1.5 rounded-md text-ink-3 hover:text-ink-4 hover:bg-ink-1 transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        {!isToday && (
          <button
            type="button"
            onClick={() => changeDate(todayKey())}
            className="px-2 py-1 rounded text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase text-accent border border-accent/40 hover:bg-accent/15 transition-colors"
          >
            Today
          </button>
        )}
      </div>

      {/* Loading */}
      {data === null && (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-6 text-center">
          Loading...
        </div>
      )}

      {/* Progress bar */}
      {data && data.progress.total > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-ink-1 border border-ink-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-ok/60 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <Mono className="text-[11px] text-ink-3 shrink-0">
            {data.progress.taken} / {data.progress.total}
          </Mono>
        </div>
      )}

      {/* Empty state */}
      {data && data.slots.length === 0 && (
        <div className="rounded-md bg-ink-1 p-6 text-center text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          No active supplements configured.
        </div>
      )}

      {/* Slot sections */}
      {data?.slots.map((slot) => {
        const hasFasted = slot.items.some((i) => i.fasted);
        const hasWithFood = slot.items.some((i) => i.with_food);
        const slotTaken = slot.items.filter((i) => i.log).length;

        return (
          <div key={slot.slot} className="flex flex-col gap-1">
            {/* Slot header */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                {slot.label}
              </span>
              {hasFasted && (
                <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-warn/15 text-warn border border-warn/30 font-[family-name:var(--font-mono)]">
                  Fasted
                </span>
              )}
              {hasWithFood && (
                <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-ok/15 text-ok border border-ok/30 font-[family-name:var(--font-mono)]">
                  With food
                </span>
              )}
              <span className="flex-1" />
              <Mono className="text-[10px] text-ink-3">
                {slotTaken}/{slot.items.length}
              </Mono>
            </div>

            {/* Items */}
            <div className="flex flex-col gap-px rounded-md overflow-hidden border border-ink-2">
              {slot.items.map((item) => {
                const taken = !!item.log;
                const busy = toggling.has(item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item, slot.slot)}
                    disabled={busy}
                    className={`flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      taken
                        ? "bg-ok/[0.06] hover:bg-ok/[0.10]"
                        : "bg-ink-1 hover:bg-ink-2/60"
                    } disabled:opacity-50`}
                  >
                    {/* Checkbox */}
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        taken
                          ? "bg-ok/20 border-ok/50 text-ok"
                          : "border-ink-3 text-transparent"
                      }`}
                    >
                      {taken && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>

                    {/* Name + dose */}
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm ${taken ? "text-ink-3 line-through" : "text-ink-4"}`}
                      >
                        {item.name}
                      </span>
                    </div>

                    <Mono
                      className={`text-[11px] shrink-0 ${taken ? "text-ink-2" : "text-ink-3"}`}
                    >
                      {item.dose}
                    </Mono>

                    <span
                      className={`text-[10px] uppercase tracking-[0.08em] font-[family-name:var(--font-mono)] shrink-0 w-[50px] text-right ${
                        taken ? "text-ink-2" : "text-ink-3"
                      }`}
                    >
                      {item.form}
                    </span>

                    {/* Time taken or brand */}
                    <span className="text-[10px] font-[family-name:var(--font-mono)] text-ink-3 w-[48px] text-right shrink-0">
                      {taken ? fmtTime(item.log!.taken_at) : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
