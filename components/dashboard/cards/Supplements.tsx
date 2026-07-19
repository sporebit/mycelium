"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { localDateKey } from "@/lib/util/date";
import type { CardWidth } from "@/lib/dashboard/card-registry";
import { useApi } from "@/lib/data/useApi";
import { mutateApi } from "@/lib/data/mutateApi";

type DailyLog = { id: string; taken_at: string };

type DailyItem = {
  id: string;
  name: string;
  dose: string;
  form: string;
  fasted: boolean;
  with_food: boolean;
  log: DailyLog | null;
};

type Slot = {
  slot: string;
  label: string;
  items: DailyItem[];
};

type DailyData = {
  date: string;
  slots: Slot[];
  progress: { taken: number; total: number };
};

export function Supplements({ width = 1 }: { width?: CardWidth } = {}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const today = localDateKey();
  const key = `/api/supplements/daily?date=${today}`;

  const { data } = useApi<DailyData>(key);

  async function toggle(item: DailyItem, slot: string) {
    if (toggling.has(item.id)) return;
    setToggling((s) => new Set(s).add(item.id));

    const currentlyLogged = !!item.log;
    // Capture timestamp outside the optimistic updater — the updater is
    // called during render by SWR, and React 19 forbids Date.now() there.
    const nowIso = new Date().toISOString();

    await mutateApi<DailyData>(
      key,
      (current) => {
        if (!current) {
          return {
            date: today,
            slots: [],
            progress: { taken: 0, total: 0 },
          };
        }
        return {
          ...current,
          progress: {
            ...current.progress,
            taken:
              current.progress.taken + (currentlyLogged ? -1 : 1),
          },
          slots: current.slots.map((s) => ({
            ...s,
            items: s.items.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    log: currentlyLogged
                      ? null
                      : { id: "optimistic", taken_at: nowIso },
                  }
                : i,
            ),
          })),
        };
      },
      async () => {
        if (currentlyLogged && item.log) {
          const res = await fetch(
            `/api/supplements/${item.id}/log/${item.log.id}`,
            { method: "DELETE" },
          );
          if (!res.ok) throw new Error(`unlog failed (${res.status})`);
        } else {
          const res = await fetch(`/api/supplements/${item.id}/log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: today, timing_slot: slot }),
          });
          if (!res.ok) throw new Error(`log failed (${res.status})`);
        }
      },
    );

    setToggling((s) => {
      const next = new Set(s);
      next.delete(item.id);
      return next;
    });
  }

  const pct =
    data && data.progress.total > 0
      ? Math.round((data.progress.taken / data.progress.total) * 100)
      : 0;

  return (
    <Panel
      borderless
      title="SUPPLEMENTS"
      topRight={
        <Link
          href="/health/supplements"
          className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 font-[family-name:var(--font-mono)]"
        >
          OPEN →
        </Link>
      }
    >
      {data === undefined ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
          Loading…
        </div>
      ) : data.progress.total === 0 ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
          No active supplements
        </div>
      ) : (
        <div className={width >= 3 ? "mt-2 grid grid-cols-2 gap-x-6" : "contents"}>
          <div>
            <div className="mt-2 flex items-baseline gap-2">
              <Mono className="text-2xl text-ink-4 tabular-nums">
                {data.progress.taken}/{data.progress.total}
              </Mono>
              <Mono className="text-[10px] text-ink-3">
                {pct}%
              </Mono>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-ink-2 overflow-hidden">
              <div
                className="h-full bg-ok transition-[width] duration-300 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            {data.slots.map((slot) => {
              const takenCount = slot.items.filter((i) => i.log).length;
              const allDone = takenCount === slot.items.length;
              const isOpen = expanded.has(slot.slot);
              return (
                <div key={slot.slot}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((s) => {
                        const next = new Set(s);
                        if (next.has(slot.slot)) next.delete(slot.slot);
                        else next.add(slot.slot);
                        return next;
                      })
                    }
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] transition-colors ${
                      allDone
                        ? "bg-ok/10 text-ok"
                        : "bg-ink-1 text-ink-3 hover:text-ink-4"
                    }`}
                  >
                    <span className="uppercase">{slot.label}</span>
                    <span className="ml-auto tabular-nums">
                      {takenCount}/{slot.items.length}
                    </span>
                    {allDone && <span>✓</span>}
                  </button>
                  {isOpen && (
                    <div className="flex flex-wrap gap-1 mt-1 ml-1">
                      {slot.items.map((item) => {
                        const taken = !!item.log;
                        const busy = toggling.has(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggle(item, slot.slot)}
                            disabled={busy}
                            className={`px-2 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] transition-colors disabled:opacity-50 ${
                              taken
                                ? "bg-ok/15 text-ok"
                                : "bg-ink-2 text-ink-3 hover:text-ink-4"
                            }`}
                          >
                            {item.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}
