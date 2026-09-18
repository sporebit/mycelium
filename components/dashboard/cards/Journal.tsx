"use client";

import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { useApi } from "@/lib/data/useApi";
import type { CardWidth } from "@/lib/dashboard/card-registry";
import type { DayRow } from "@/lib/daylog/engine";
import { daylogDay } from "@/lib/daylog/day";

/** Dashboard card: today's day-log row — status, entry so far, scores, and the way in. */
export function Journal({ width = 1 }: { width?: CardWidth } = {}) {
  const today = daylogDay();
  const { data } = useApi<{ day: DayRow; score_keys: string[] }>(`/api/journal/days/${today}`);
  const day = data?.day ?? null;
  const userTurns = day ? (day.transcript ?? []).filter((e) => e.role === "user").length : 0;
  const scores = day ? Object.entries(day.scores ?? {}) : [];

  return (
    <Panel
      borderless
      title="JOURNAL"
      topRight={<Mono>{day ? day.status.toUpperCase() : "TODAY"}</Mono>}
      bottomCTA={
        <Link href={`/journal/${today}`} className="hover:text-ink-4 transition-colors">
          {day && (day.status === "open" || day.status === "closing") ? "CONTINUE →" : day && day.status === "closed" ? "READ →" : "LOG TODAY →"}
        </Link>
      }
    >
      {!data ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3">Loading…</div>
      ) : (
        <div className="flex flex-col gap-2 py-1">
          {day?.summary ? (
            <p className={`text-sm text-text-1 ${width === 1 ? "line-clamp-4" : "line-clamp-6"}`}>{day.summary.split("\n")[0]}</p>
          ) : userTurns > 0 ? (
            <p className="text-xs text-text-2">{userTurns} message{userTurns === 1 ? "" : "s"} so far — the entry is written at close.</p>
          ) : (
            <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">Nothing logged yet. The bot asks this evening.</p>
          )}
          {scores.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {scores.map(([k, v]) => (
                <span key={k} className="rounded-full bg-glow-3/40 px-2 py-0.5 text-[10px] text-glow-1 font-[family-name:var(--font-mono)]">
                  {k} {v}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
