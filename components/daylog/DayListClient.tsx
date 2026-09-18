"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import { Mono } from "@/components/dashboard/Mono";
import { shiftDate } from "@/lib/daylog/day";

type DayListRow = {
  id: string;
  day: string;
  status: string;
  mode: string | null;
  summary: string | null;
  scores: Record<string, number>;
  turn_count: number;
  user_turns: number;
  cost_pence: number;
  closed_at: string | null;
  legacy: boolean;
};
type Series = { keys: string[]; series: Array<Record<string, number | string | null>> };

function monthLabel(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const STATUS_TONE: Record<string, string> = {
  closed: "text-ok border-ok/40",
  skipped: "text-text-2 border-ink-4",
  open: "text-glow-1 border-glow-2/50",
  closing: "text-warn border-warn/40",
  prompted: "text-warn border-warn/40",
  pending: "text-text-2 border-ink-4",
};

/** The 30-day sparkline strip: one row per score key (spec §6). */
export function ScoreStrip({ data }: { data: Series | undefined }) {
  if (!data || !data.series.length) return null;
  const last = data.series.slice(-30);
  return (
    <div className="rounded-md bg-ink-1 p-4 flex flex-col gap-2">
      {data.keys.map((k) => {
        const vals = last.map((r) => (typeof r[k] === "number" ? (r[k] as number) : null));
        const known = vals.filter((v): v is number => v !== null);
        const avg = known.length ? (known.reduce((a, b) => a + b, 0) / known.length).toFixed(1) : "–";
        return (
          <div key={k} className="flex items-center gap-3">
            <Mono className="w-24 text-[10px] uppercase tracking-[0.15em] text-text-2">{k}</Mono>
            <div className="flex items-end gap-[2px] h-6 flex-1">
              {vals.map((v, i) => (
                <span key={i} title={`${last[i].day}: ${v ?? "–"}`} className={`w-[6px] rounded-sm ${v === null ? "bg-ink-2 h-1" : "bg-glow-2/70"}`} style={v === null ? undefined : { height: `${(v / 5) * 100}%` }} />
              ))}
            </div>
            <Mono className="w-8 text-right text-[10px] text-text-2">{avg}</Mono>
          </div>
        );
      })}
    </div>
  );
}

const input = "bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const btn = "px-3 py-1.5 rounded-sm border border-ink-4 text-xs text-text-1 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.1em]";

export function DayListClient() {
  const { data } = useApi<{ days: DayListRow[]; today: string }>("/api/journal/days");
  const { data: scores } = useApi<Series>("/api/journal/scores");
  const [past, setPast] = useState("");
  const days = data?.days ?? [];
  const today = data?.today ?? "";

  const groups = new Map<string, DayListRow[]>();
  for (const d of days) groups.set(d.day.slice(0, 7), [...(groups.get(d.day.slice(0, 7)) ?? []), d]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-text-0">Journal</h1>
        <div className="flex items-center gap-2">
          {today && (
            <Link href={`/journal/${today}`} className={btn}>
              TODAY
            </Link>
          )}
          {today && (
            <Link href={`/journal/${shiftDate(today, -1)}`} className={btn}>
              YESTERDAY
            </Link>
          )}
          <input type="date" value={past} onChange={(e) => setPast(e.target.value)} className={input} aria-label="Log a past day" />
          {past && (
            <Link href={`/journal/${past}`} className={btn}>
              OPEN
            </Link>
          )}
        </div>
      </div>

      <ScoreStrip data={scores} />

      {!data ? (
        <div className="text-sm text-ink-3 italic">Loading…</div>
      ) : days.length === 0 ? (
        <div className="text-sm text-ink-3 italic">No days yet. The bot asks every evening; or open today and press Talk.</div>
      ) : (
        Array.from(groups.entries()).map(([month, rows]) => (
          <section key={month} className="flex flex-col gap-2">
            <div className="card-eyebrow pt-2">{monthLabel(rows[0].day)}</div>
            {rows.map((d) => (
              <Link key={d.id} href={`/journal/${d.day}`} className="rounded-md bg-ink-1 p-4 flex flex-col gap-1.5 hover:bg-ink-2/60 transition-colors">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-text-0 font-medium">{dayLabel(d.day)}</span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] ${STATUS_TONE[d.status] ?? ""}`}>
                    {d.status}
                    {d.mode && d.mode !== "talk" ? ` · ${d.mode}` : ""}
                  </span>
                  <span className="flex-1" />
                  <div className="flex items-center gap-1">
                    {Object.entries(d.scores ?? {}).map(([k, v]) => (
                      <span key={k} title={`${k} ${v}`} className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-glow-3/50 text-[9px] text-glow-1">
                        {v}
                      </span>
                    ))}
                  </div>
                  {d.cost_pence > 0 && <Mono className="text-[10px] text-text-2">{d.cost_pence.toFixed(1)}p</Mono>}
                </div>
                {d.summary ? <p className="text-sm text-text-1 line-clamp-2">{d.summary.split("\n")[0]}</p> : <p className="text-xs text-text-2 italic">{d.user_turns ? `${d.user_turns} messages, no summary` : "nothing logged"}</p>}
              </Link>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
