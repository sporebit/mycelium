"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Surface, Skeleton, Sheet, Label } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { mutateApi } from "@/lib/data/mutateApi";
import { localDateKey } from "@/lib/util/date";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarName: string;
  calendarColour: string;
};

type FitnessToday = {
  slots?: Record<string, Array<{ label?: string; kind?: string; programme_session_id?: string | null }>>;
};

type SuppLog = { id: string; taken_at: string };
type SuppItem = { id: string; name: string; dose: string; log: SuppLog | null };
type SuppSlot = { slot: string; label: string; items: SuppItem[] };
type SuppData = { date: string; slots: SuppSlot[]; progress: { taken: number; total: number } };

type BinsData = {
  next: { date: string; type: "recycling" | "black"; gardenIncluded: boolean };
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function TimelineRail() {
  const today = localDateKey();
  const supplementsKey = `/api/supplements/daily?date=${today}`;
  const [openSlot, setOpenSlot] = useState<string | null>(null);

  const { data: cal, isLoading: calLoading } =
    useApi<{ events?: CalendarEvent[] }>("/api/calendar");
  const { data: fit, isLoading: fitLoading } =
    useApi<FitnessToday>("/api/fitness/today");
  const { data: supp, isLoading: suppLoading } =
    useApi<SuppData>(supplementsKey);
  const { data: bins, isLoading: binsLoading } =
    useApi<BinsData>("/api/bins/next");

  const todayEvents = useMemo(() => {
    const arr = cal?.events ?? [];
    return arr
      .filter((e) => isToday(e.start))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [cal]);

  const activeSuppSlot = openSlot
    ? supp?.slots.find((s) => s.slot === openSlot) ?? null
    : null;

  async function toggleSupp(item: SuppItem, slot: string) {
    const currentlyLogged = !!item.log;
    const nowIso = new Date().toISOString();
    await mutateApi<SuppData>(
      supplementsKey,
      (current) => {
        if (!current) {
          return { date: today, slots: [], progress: { taken: 0, total: 0 } };
        }
        return {
          ...current,
          progress: {
            ...current.progress,
            taken: current.progress.taken + (currentlyLogged ? -1 : 1),
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
  }

  const anyLoading = calLoading || fitLoading || suppLoading || binsLoading;

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <Label>Today</Label>
      </div>
      <div className="-mx-4 sm:-mx-6 overflow-x-auto no-scrollbar">
        <div className="inline-flex items-stretch gap-3 px-4 sm:px-6 snap-x snap-mandatory">
          {anyLoading &&
            todayEvents.length === 0 &&
            !supp &&
            !fit &&
            !bins &&
            [0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-[140px] shrink-0" />
            ))}

          {todayEvents.map((e) => (
            <TimelineTile key={`ev-${e.id}`}>
              <div className="text-[10px] uppercase tracking-[0.08em] text-text-lo font-[family-name:var(--font-jetbrains-mono)]">
                {e.allDay ? "All day" : fmtTime(e.start)}
              </div>
              <div
                className="mt-1.5 text-sm text-text-hi line-clamp-2 pl-2 border-l-2"
                style={{ borderColor: e.calendarColour || "var(--glow-dim)" }}
              >
                {e.title}
              </div>
            </TimelineTile>
          ))}

          {fit?.slots &&
            Object.entries(fit.slots)
              .flatMap(([slot, entries]) =>
                (entries ?? []).map((entry, i) => (
                  <Link
                    key={`fit-${slot}-${i}`}
                    href="/fitness"
                    className="snap-start"
                  >
                    <TimelineTile>
                      <div className="text-[10px] uppercase tracking-[0.08em] text-text-lo">
                        {slot}
                      </div>
                      <div className="mt-1.5 text-sm text-text-hi line-clamp-2">
                        {entry.label ?? entry.kind ?? "Workout"}
                      </div>
                    </TimelineTile>
                  </Link>
                )),
              )}

          {supp?.slots.map((s) => (
            <button
              key={`sup-${s.slot}`}
              type="button"
              onClick={() => setOpenSlot(s.slot)}
              className="snap-start text-left"
            >
              <TimelineTile>
                <div className="text-[10px] uppercase tracking-[0.08em] text-text-lo">
                  {s.label}
                </div>
                <div className="mt-1.5 text-sm text-text-hi">
                  {s.items.filter((i) => i.log).length}/{s.items.length} taken
                </div>
                <div className="mt-1 text-[11px] text-text-lo truncate">
                  {s.items.map((i) => i.name).join(", ")}
                </div>
              </TimelineTile>
            </button>
          ))}

          {bins?.next && (
            <Link href="/" className="snap-start">
              <TimelineTile>
                <div className="text-[10px] uppercase tracking-[0.08em] text-text-lo">
                  Bins ·{" "}
                  {new Date(bins.next.date + "T00:00:00").toLocaleDateString(
                    "en-GB",
                    { weekday: "short" },
                  )}
                </div>
                <div className="mt-1.5 text-sm text-text-hi">
                  {bins.next.type === "black"
                    ? "Black bin"
                    : bins.next.gardenIncluded
                      ? "Recycling + garden"
                      : "Recycling"}
                </div>
              </TimelineTile>
            </Link>
          )}
        </div>
      </div>

      <Sheet
        open={!!openSlot}
        onClose={() => setOpenSlot(null)}
        title={activeSuppSlot ? `${activeSuppSlot.label} supplements` : ""}
      >
        {activeSuppSlot ? (
          <ul className="flex flex-col gap-1">
            {activeSuppSlot.items.map((item) => {
              const taken = !!item.log;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void toggleSupp(item, activeSuppSlot.slot)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-v2-md text-left transition-colors ${
                      taken
                        ? "bg-glow-wash text-text-hi"
                        : "bg-surface-2 text-text-mid hover:text-text-hi"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-4 w-4 rounded-v2-sm flex items-center justify-center text-[11px] ${
                        taken
                          ? "bg-glow text-surface-0"
                          : "border border-hairline-strong"
                      }`}
                    >
                      {taken ? "✓" : ""}
                    </span>
                    <span className="flex-1">{item.name}</span>
                    <span className="text-[11px] text-text-lo">
                      {item.dose}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Sheet>
    </div>
  );
}

function TimelineTile({ children }: { children: React.ReactNode }) {
  return (
    <Surface
      level={1}
      className="p-3 w-[140px] shrink-0 snap-start flex flex-col justify-between min-h-[96px]"
    >
      {children}
    </Surface>
  );
}
