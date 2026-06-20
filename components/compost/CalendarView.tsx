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

const COLOUR_LEGEND = [
  { label: "Calendar", colour: "#e8e6dd" },
  { label: "Tasks", colour: "#f5b56d" },
  { label: "Birthdays", colour: "#f56db5" },
  { label: "Events", colour: "#6db8f5" },
];

const EVENT_COLOURS = [
  { label: "Default", value: "#e8e6dd" },
  { label: "Blue", value: "#6db8f5" },
  { label: "Green", value: "#84f5b8" },
  { label: "Amber", value: "#f5b56d" },
  { label: "Pink", value: "#f56db5" },
  { label: "Red", value: "#ef4444" },
];

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
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [saving, setSaving] = useState(false);

  // Event form
  const [evTitle, setEvTitle] = useState("");
  const [evStartDate, setEvStartDate] = useState("");
  const [evStartTime, setEvStartTime] = useState("09:00");
  const [evEndDate, setEvEndDate] = useState("");
  const [evEndTime, setEvEndTime] = useState("10:00");
  const [evAllDay, setEvAllDay] = useState(false);
  const [evLocation, setEvLocation] = useState("");
  const [evNotes, setEvNotes] = useState("");
  const [evColour, setEvColour] = useState("#e8e6dd");

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
    return (eventsByDay.get(selected) ?? []).sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.start.localeCompare(b.start);
    });
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

  function openAddEvent() {
    setEvStartDate(selected);
    setEvEndDate(selected);
    setShowAddEvent(true);
  }

  function resetEventForm() {
    setEvTitle(""); setEvStartDate(""); setEvStartTime("09:00");
    setEvEndDate(""); setEvEndTime("10:00");
    setEvAllDay(false); setEvLocation(""); setEvNotes(""); setEvColour("#e8e6dd");
  }

  async function saveEvent() {
    if (!evTitle.trim() || !evStartDate) return;
    setSaving(true);
    try {
      const startAt = evAllDay
        ? `${evStartDate}T00:00:00`
        : `${evStartDate}T${evStartTime}:00`;
      const endAt = evAllDay
        ? null
        : evEndDate ? `${evEndDate}T${evEndTime}:00` : `${evStartDate}T${evEndTime}:00`;

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: evTitle.trim(),
          start_at: startAt,
          end_at: endAt,
          all_day: evAllDay,
          location: evLocation.trim() || null,
          notes: evNotes.trim() || null,
          colour: evColour,
        }),
      });
      if (res.ok) {
        resetEventForm();
        setShowAddEvent(false);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = new Date(year, month).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const inputCls = "w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3";

  // Upcoming birthdays (next 30 days)
  const upcomingBirthdays = useMemo(() => {
    if (!events) return [];
    const now = new Date();
    const cutoff = new Date(now.getTime() + 30 * 86400000);
    return events.filter((e) =>
      e.calendarName === "Birthdays" &&
      new Date(e.start) >= now &&
      new Date(e.start) <= cutoff
    ).sort((a, b) => a.start.localeCompare(b.start));
  }, [events]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Calendar
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAddEvent}
            className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 transition-colors"
          >
            ADD EVENT
          </button>
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

      {/* Colour legend */}
      <div className="flex items-center gap-3 text-[9px] font-[family-name:var(--font-mono)] text-ink-3">
        {COLOUR_LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: l.colour }} />
            {l.label}
          </span>
        ))}
      </div>

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
          const dayEvts = eventsByDay.get(key) ?? [];
          const allDayEvts = dayEvts.filter((e) => e.allDay);
          const timedEvts = dayEvts.filter((e) => !e.allDay);

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`bg-ink-0 px-1.5 py-1.5 text-left transition-colors min-h-[56px] flex flex-col ${
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
              {/* All-day event chips */}
              {allDayEvts.slice(0, 1).map((e) => (
                <span
                  key={e.id}
                  className="mt-0.5 w-full truncate text-[8px] px-1 py-px rounded font-[family-name:var(--font-mono)]"
                  style={{
                    backgroundColor: hexAlpha(e.calendarColour, "30"),
                    color: e.calendarColour,
                  }}
                >
                  {e.title}
                </span>
              ))}
              {/* Timed event dots */}
              {timedEvts.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap">
                  {timedEvts.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: e.calendarColour }}
                    />
                  ))}
                  {timedEvts.length > 3 && (
                    <Mono className="text-[8px] text-ink-3">+{timedEvts.length - 3}</Mono>
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
                <span
                  className="w-1 h-8 rounded-full shrink-0"
                  style={{ backgroundColor: e.calendarColour }}
                />
                <Mono className="text-[11px] text-ink-3 w-24 shrink-0">
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

      {/* Upcoming birthdays */}
      {upcomingBirthdays.length > 0 && (
        <section>
          <Mono className="text-[10px] text-ink-3 mb-2">UPCOMING BIRTHDAYS</Mono>
          <div className="flex flex-wrap gap-2">
            {upcomingBirthdays.map((b) => {
              const d = new Date(b.start);
              const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              return (
                <span
                  key={b.id}
                  className="px-2 py-1 rounded-lg text-xs font-[family-name:var(--font-display)]"
                  style={{ backgroundColor: hexAlpha("#f56db5", "20"), color: "#f56db5" }}
                >
                  {b.title.replace(" 🎂", "")} — {label}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-warn font-[family-name:var(--font-mono)]">
          ⚠ Failed: {failed.join(", ")}
        </div>
      )}

      {/* Add event modal */}
      {showAddEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-4">
              Add Event
            </h2>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">TITLE</label>
                <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} className={inputCls} placeholder="Event title" />
              </div>

              <label className="flex items-center gap-2 text-xs text-ink-4 font-[family-name:var(--font-mono)] cursor-pointer">
                <input type="checkbox" checked={evAllDay} onChange={(e) => setEvAllDay(e.target.checked)} className="accent-accent" />
                All day
              </label>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">START DATE</label>
                  <input type="date" value={evStartDate} onChange={(e) => setEvStartDate(e.target.value)} className={inputCls} />
                </div>
                {!evAllDay && (
                  <div>
                    <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">START TIME</label>
                    <input type="time" value={evStartTime} onChange={(e) => setEvStartTime(e.target.value)} className={inputCls} />
                  </div>
                )}
              </div>

              {!evAllDay && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">END DATE</label>
                    <input type="date" value={evEndDate} onChange={(e) => setEvEndDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">END TIME</label>
                    <input type="time" value={evEndTime} onChange={(e) => setEvEndTime(e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">LOCATION</label>
                <input value={evLocation} onChange={(e) => setEvLocation(e.target.value)} className={inputCls} placeholder="Optional" />
              </div>

              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">NOTES</label>
                <textarea value={evNotes} onChange={(e) => setEvNotes(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
              </div>

              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-1 block">COLOUR</label>
                <div className="flex gap-1">
                  {EVENT_COLOURS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEvColour(c.value)}
                      className={`h-7 w-7 rounded-full border-2 transition-colors ${
                        evColour === c.value ? "border-ink-4 scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { resetEventForm(); setShowAddEvent(false); }}
                className="px-3 py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={saveEvent}
                disabled={saving || !evTitle.trim() || !evStartDate}
                className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 transition-colors"
              >
                {saving ? "SAVING…" : "SAVE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
