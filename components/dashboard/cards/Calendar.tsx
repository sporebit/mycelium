"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "../Panel";
import { Mono } from "../Mono";

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

function getWeek(d: Date): Date[] {
  const day = d.getDay();
  const diffToMon = (day + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMon);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return x;
  });
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtTimeRange(start: string, end: string): string {
  return `${fmtTime(new Date(start))} – ${fmtTime(new Date(end))}`;
}

function hexAlpha(hex: string, alphaHex: string): string {
  // Accept #RRGGBB or #RGB; append alpha for use in bg/border style.
  if (!hex.startsWith("#")) return hex;
  if (hex.length === 4) {
    const r = hex[1], g = hex[2], b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}${alphaHex}`;
  }
  return `${hex.slice(0, 7)}${alphaHex}`;
}

export function Calendar() {
  const [today] = useState<Date>(() => new Date());
  const [nowMin, setNowMin] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<string>(() => ymd(new Date()));
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [failedCalendars, setFailedCalendars] = useState<string[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNowMin(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/calendar")
      .then((r) => r.json())
      .then(
        (j: { events?: CalendarEvent[]; failedCalendars?: string[] }) => {
          if (!mounted) return;
          setEvents(Array.isArray(j?.events) ? j.events : []);
          setFailedCalendars(
            Array.isArray(j?.failedCalendars) ? j.failedCalendars : []
          );
        }
      )
      .catch(() => mounted && setEvents([]));
    return () => {
      mounted = false;
    };
  }, []);

  const week = useMemo(() => getWeek(today), [today]);
  const monthLabel = today
    .toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    .toUpperCase();

  const dayEvents = useMemo(() => {
    if (!events) return [];
    return events
      .filter((e) => ymd(new Date(e.start)) === selected)
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events, selected]);

  const todayKey = ymd(today);
  const isTodaySelected = selected === todayKey;

  let nowMarkerIndex = -1;
  if (isTodaySelected && dayEvents.length > 0) {
    const idx = dayEvents.findIndex((e) => new Date(e.start) > nowMin);
    nowMarkerIndex = idx === -1 ? dayEvents.length : idx;
  }

  return (
    <Panel
      borderless
      number="04"
      title="CALENDAR"
      topRight={<Mono>{monthLabel}</Mono>}
      bottomCTA={
        <span className="cursor-pointer hover:text-ink-4">OPEN CALENDAR →</span>
      }
    >
      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1.5">
        {week.map((d, i) => {
          const key = ymd(d);
          const isToday = todayKey === key;
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                isSelected
                  ? "border-accent/70 bg-accent/15"
                  : isToday
                    ? "border-accent/40 bg-accent/5 hover:bg-accent/10"
                    : "border-ink-2 bg-ink-0/40 hover:border-ink-3"
              }`}
              aria-current={isToday ? "date" : undefined}
            >
              <div
                className={`text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] ${
                  isSelected || isToday ? "text-accent" : "text-ink-3"
                }`}
              >
                {DAY_LABELS[i]}
              </div>
              <Mono
                className={`block mt-1 text-base ${
                  isSelected
                    ? "text-ink-4"
                    : isToday
                      ? "text-ink-4"
                      : "text-ink-3"
                }`}
              >
                {String(d.getDate()).padStart(2, "0")}
              </Mono>
            </button>
          );
        })}
      </div>

      {/* Event list / states */}
      {events === null ? (
        <ul className="mt-5 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="h-10 rounded-md bg-ink-2/30 animate-pulse"
            />
          ))}
        </ul>
      ) : dayEvents.length === 0 ? (
        <div className="mt-6 text-xs text-ink-3 italic font-[family-name:var(--font-display)] text-center py-4">
          Nothing scheduled
        </div>
      ) : (
        <ul className="mt-5 flex flex-col divide-y divide-ink-2">
          {dayEvents.flatMap((e, idx) => {
            const rows = [];
            if (idx === nowMarkerIndex && isTodaySelected) {
              rows.push(
                <li
                  key={`now-${idx}`}
                  className="flex items-center gap-2 py-1"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                  <div className="flex-1 h-px bg-accent/40" />
                  <Mono className="text-[10px] text-accent">
                    NOW {fmtTime(nowMin)}
                  </Mono>
                </li>
              );
            }
            rows.push(
              <li
                key={e.id}
                className="flex items-center gap-3 py-2.5 first:pt-0"
              >
                <Mono className="text-[11px] text-ink-3 w-28 shrink-0">
                  {e.allDay ? "ALL DAY" : fmtTimeRange(e.start, e.end)}
                </Mono>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-4 truncate">{e.title}</div>
                  {(e.location || e.description) && (
                    <div className="text-[11px] text-ink-3 truncate">
                      {e.location ||
                        e.description.split(/\r?\n/)[0].slice(0, 120)}
                    </div>
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
            );
            return rows;
          })}
          {nowMarkerIndex === dayEvents.length && isTodaySelected && (
            <li className="flex items-center gap-2 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              <div className="flex-1 h-px bg-accent/40" />
              <Mono className="text-[10px] text-accent">
                NOW {fmtTime(nowMin)}
              </Mono>
            </li>
          )}
        </ul>
      )}

      {failedCalendars.length > 0 && (
        <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-warn font-[family-name:var(--font-mono)]">
          ⚠ Failed: {failedCalendars.join(", ")}
        </div>
      )}
    </Panel>
  );
}
