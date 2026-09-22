"use client";

import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import type { WeekBlock as WeekBlockData } from "@/lib/daylog/afterClose";

type Payload = WeekBlockData & { iso_year: number; iso_week: number; week_start: string; week_end: string };

function weekday(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

/**
 * The day-log block of the weekly review (daylog spec §4.4 step 5): the
 * week's seven days with their first line and score dots, and the averages.
 * Read-only here — the day pages are where anything is edited.
 */
export function WeekBlock({ isoYear, isoWeek }: { isoYear: number; isoWeek: number }) {
  const { data } = useApi<Payload>(`/api/journal/week?week=${isoYear}-W${String(isoWeek).padStart(2, "0")}`);
  if (!data) return null;
  const keys = Object.keys(data.averages);
  if (!data.days.length) return null;

  return (
    <section className="rounded-md bg-ink-1 p-4 flex flex-col gap-3">
      <div className="card-eyebrow flex items-center justify-between gap-3 flex-wrap">
        <span>Day log</span>
        <Mono className="text-[10px] text-text-2">
          {data.logged} logged · {data.skipped} skipped
          {keys.length ? ` · ${keys.map((k) => `${k} ${data.averages[k]}`).join(" · ")}` : ""}
        </Mono>
      </div>
      <ul className="flex flex-col gap-1.5">
        {data.days.map((d) => (
          <li key={d.day} className="flex items-baseline gap-3">
            <Link href={`/journal/${d.day}`} className="w-10 shrink-0 text-[10px] text-text-2 hover:text-glow-2 font-[family-name:var(--font-mono)]">
              {weekday(d.day)}
            </Link>
            <span className="min-w-0 flex-1 text-sm text-text-1 truncate">{d.first_line ?? <span className="italic text-text-2">{d.status === "skipped" ? "skipped" : d.status}</span>}</span>
            <span className="flex gap-1 shrink-0">
              {Object.entries(d.scores ?? {}).map(([k, v]) => (
                <span key={k} title={`${k} ${v}`} className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-glow-3/50 text-[9px] text-glow-1">
                  {v}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
