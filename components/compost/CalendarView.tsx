"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarName: string;
  calendarColour: string;
  location: string;
  description: string;
};

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtTimeRange(start: string, end: string): string {
  return `${fmtTime(new Date(start))} – ${fmtTime(new Date(end))}`;
}

function hexAlpha(hex: string, alphaHex: string): string {
  if (!hex.startsWith("#")) return hex;
  if (hex.length === 4) {
    const r = hex[1], g = hex[2], b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}${alphaHex}`;
  }
  return `${hex.slice(0, 7)}${alphaHex}`;
}

function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7;
  const cells: Date[] = [];
  for (let i = -startDay; cells.length < 42; i++) {
    const d = new Date(year, month, 1 + i);
    cells.push(d);
    if (i >= 27 && cells.length % 7 === 0 && d.getMonth() !== month) break;
  }
  return cells;
}

export function CalendarView() {
  const [today] = useState(() => new Date());
  const [year, setYear] = useState(() => today.getFullYear());
  const [month, setMonth] = useState(() => today.getMonth());
  const [selected, setSelected] = useState(() => ymd(today));
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  const load = useCallback(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((j: { events?: CalendarEvent[]; failedCalendars?: string[] }) => {
        setEvents(Array.isArray(j?.events) ? j.events : []);
        setFailed(Array.isArray(j?.failedCalendars) ? j.failedCalendars : []);
      })
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const todayKey = ymd(today);

  const eventsByDay = useMemo(() => {
    if (!events) return new Map<string, CalendarEvent[]>();
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = ymd(new Date(e.start));
      const arr = m.get(key);
      if (arr) arr.push(e);
      else m.set(key, [e]);
    }
    return m;
  }, [events]);

  const dayEvents = useMemo(() => {
    return (eventsByDay.get(selected) ?? []).sort((a, b) => a.start.localeCompare(b.start));
  }, [eventsByDay, selected]);

  function prev() {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  }
  function next() {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelected(todayKey);
  }

  const monthLabel = new Date(year, month).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Calendar
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            className="px-2 py-1 rounded-md text-ink-3 hover:text-ink-4 hover:bg-ink-2/40 text-sm transition-colors"
          >
            ←
          </button>
          <Mono className="text-sm text-ink-4 min-w-[140px] text-center">
            {monthLabel.toUpperCase()}
          </Mono>
          <button
            type="button"
            onClick={next}
            className="px-2 py-1 rounded-md text-ink-3 hover:text-ink-4 hover:bg-ink-2/40 text-sm transition-colors"
          >
            →
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-2 px-3 py-1 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em] text-ink-3 hover:text-ink-4 border border-ink-2 hover:border-ink-3 transition-colors"
          >
            TODAY
          </button>
        </div>
      </header>

      {/* Month grid */}
      <div className="grid grid-cols-7 gap-px bg-ink-2/40 rounded-md overflow-hidden border border-ink-2">
        {DAY_LABELS.map((d) => (
          <div key={d} className="bg-ink-0 px-2 py-1.5 text-center">
            <Mono className="text-[10px] text-ink-3">{d}</Mono>
          </div>
        ))}
        {cells.map((d) => {
          const key = ymd(d);
          const isCurrentMonth = d.getMonth() === month;
          const isToday = key === todayKey;
          const isSelected = key === selected;
          const count = eventsByDay.get(key)?.length ?? 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`bg-ink-0 px-2 py-2 text-left transition-colors min-h-[52px] ${
                isSelected
                  ? "bg-accent/10 ring-1 ring-inset ring-accent/40"
                  : isToday
                    ? "bg-accent/5"
                    : "hover:bg-ink-2/30"
              } ${!isCurrentMonth ? "opacity-40" : ""}`}
            >
              <Mono className={`text-xs ${isToday ? "text-accent" : isCurrentMonth ? "text-ink-4" : "text-ink-3"}`}>
                {d.getDate()}
              </Mono>
              {count > 0 && (
                <div className="flex gap-0.5 mt-1 flex-wrap">
                  {(eventsByDay.get(key) ?? []).slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: e.calendarColour }}
                    />
                  ))}
                  {count > 3 && (
                    <Mono className="text-[8px] text-ink-3">+{count - 3}</Mono>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Mono className="text-[10px] text-ink-3">
            {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
          </Mono>
          <Mono className="text-[10px] text-ink-3">{dayEvents.length}</Mono>
        </div>

        {events === null ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-md bg-ink-2/30 animate-pulse" />
            ))}
          </div>
        ) : dayEvents.length === 0 ? (
          <div className="rounded-md bg-ink-1 p-6 text-center">
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              Nothing scheduled
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {dayEvents.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 bg-ink-1 hover:bg-ink-2/60 rounded-md px-3 py-2.5 transition-colors"
              >
                <Mono className="text-[11px] text-ink-3 w-28 shrink-0">
                  {e.allDay ? "ALL DAY" : fmtTimeRange(e.start, e.end)}
                </Mono>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-4 truncate">{e.title}</div>
                  {e.location && (
                    <div className="text-[11px] text-ink-3 truncate">{e.location}</div>
                  )}
                </div>
                <span
                  style={{
                    color: e.calendarColour,
                    backgroundColor: hexAlpha(e.calendarColour, "1A"),
                    borderColor: hexAlpha(e.calendarColour, "66"),
                  }}
                  className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0"
                >
                  {e.calendarName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {failed.length > 0 && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-warn font-[family-name:var(--font-mono)]">
          ⚠ Failed: {failed.join(", ")}
        </div>
      )}
    </div>
  );
}
