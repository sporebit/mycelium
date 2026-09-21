"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import type { PersonDays as PersonDaysData, PersonFact } from "@/lib/daylog/person";

type Payload = PersonDaysData & { stats: { days_together: number; first_seen: string | null; last_seen: string | null } };

const TIMELINE_PAGE = 12;

function fmtDay(day: string, withYear = true): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

function DayLink({ day }: { day: string }) {
  return (
    <Link href={`/journal/${day}`} className="shrink-0 text-[10px] text-text-2 hover:text-glow-2 font-[family-name:var(--font-mono)]">
      {fmtDay(day)}
    </Link>
  );
}

function FactLines({ facts, showKind = false }: { facts: PersonFact[]; showKind?: boolean }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {facts.map((f) => (
        <li key={f.id} className="flex items-baseline justify-between gap-3 text-sm text-text-1">
          <span className="min-w-0">
            {showKind && <Mono className="mr-2 text-[9px] uppercase tracking-[0.12em] text-text-2">{f.kind.replace("_", " ")}</Mono>}
            {f.text}
          </span>
          <DayLink day={f.day} />
        </li>
      ))}
    </ul>
  );
}

/**
 * People detail → Days (daylog spec §6, decision 20): the stats header, the
 * scene timeline, what the day log has learned about them, the places and
 * food you have shared, and milestones. Everything here has been through the
 * review queue; every line links back to the day it came from.
 */
export function PersonDays({ personId }: { personId: string }) {
  const { data, error } = useApi<Payload>(`/api/people/${personId}/days`);
  const [showAll, setShowAll] = useState(false);

  if (error) return null;
  if (!data) {
    return (
      <section className="rounded-md bg-ink-1 p-6">
        <div className="card-eyebrow mb-3">Days</div>
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">Loading…</div>
      </section>
    );
  }

  const { stats, timeline, facts, places, milestones } = data;
  const empty = !timeline.length && !facts.length && !milestones.length;
  const shown = showAll ? timeline : timeline.slice(0, TIMELINE_PAGE);

  return (
    <section className="rounded-md bg-ink-1 p-6 flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="card-eyebrow">Days</div>
        {stats.days_together > 0 && (
          <div className="flex items-baseline gap-4 text-xs text-text-2">
            <span>
              <span className="text-lg text-text-0 font-semibold mr-1">{stats.days_together}</span>
              day{stats.days_together === 1 ? "" : "s"} together
            </span>
            {stats.first_seen && <span>first {fmtDay(stats.first_seen)}</span>}
            {stats.last_seen && <span>last {fmtDay(stats.last_seen)}</span>}
          </div>
        )}
      </div>

      {empty ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">Nothing from the day log yet. Days appear here once you approve them in Capture review.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <Mono className="text-[10px] uppercase tracking-[0.15em] text-text-2">Timeline</Mono>
            {timeline.length === 0 ? (
              <div className="text-xs text-ink-3 italic">Not in any scene yet.</div>
            ) : (
              <ul className="flex flex-col">
                {shown.map((t, i) => {
                  const newDay = i === 0 || shown[i - 1].day !== t.day;
                  return (
                    <li key={t.scene_id} className={`flex gap-3 py-1.5 ${newDay && i > 0 ? "border-t border-ink-2 mt-1 pt-2.5" : ""}`}>
                      <span className="w-20 shrink-0">{newDay && <DayLink day={t.day} />}</span>
                      <span className="min-w-0 flex flex-col">
                        <span className="text-sm text-text-0">
                          {t.title}
                          {t.place && t.place.toLowerCase() !== t.title.toLowerCase() && <span className="text-text-2"> · {t.place}</span>}
                        </span>
                        {t.line && <span className="text-xs text-text-2">{t.line}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {timeline.length > TIMELINE_PAGE && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-[10px] text-text-2 hover:text-text-0 font-[family-name:var(--font-mono)] tracking-[0.1em]">
                {showAll ? "SHOW FEWER" : `SHOW ALL ${timeline.length}`}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {milestones.length > 0 && (
              <div className="flex flex-col gap-2">
                <Mono className="text-[10px] uppercase tracking-[0.15em] text-glow-1">Milestones</Mono>
                <FactLines facts={milestones} />
              </div>
            )}
            {facts.length > 0 && (
              <div className="flex flex-col gap-2">
                <Mono className="text-[10px] uppercase tracking-[0.15em] text-text-2">Facts and preferences</Mono>
                <FactLines facts={facts} showKind />
              </div>
            )}
            {places.length > 0 && (
              <div className="flex flex-col gap-2">
                <Mono className="text-[10px] uppercase tracking-[0.15em] text-text-2">Places and food together</Mono>
                <ul className="flex flex-col gap-3">
                  {places.map((p) => (
                    <li key={p.key} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3">
                        {p.place_id ? (
                          <Link href={`/places?focus=${p.place_id}`} className="text-sm text-text-0 hover:text-glow-2">
                            {p.place}
                          </Link>
                        ) : (
                          <span className="text-sm text-text-0">{p.place}</span>
                        )}
                        <Mono className="shrink-0 text-[10px] text-text-2">
                          {p.days} day{p.days === 1 ? "" : "s"} · last {fmtDay(p.last_day, false)}
                        </Mono>
                      </div>
                      {p.shared.length > 0 && (
                        <ul className="flex flex-col gap-0.5 pl-3 border-l border-ink-2">
                          {p.shared.map((f) => (
                            <li key={f.id} className="text-xs text-text-2">
                              {f.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
