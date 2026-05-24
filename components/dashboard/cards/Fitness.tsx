"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import type { TodayResponse } from "@/lib/fitness/types";

const KIND_ICON: Record<string, string> = {
  cardio: "🏃",
  resistance: "💪",
  other: "·",
};

const SLOT_LABEL: Record<string, string> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  extra: "EXTRA",
};

export function Fitness() {
  const [data, setData] = useState<TodayResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/fitness/today", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const j = (await res.json()) as TodayResponse;
        if (mounted) setData(j);
      } catch {
        /* keep prior data */
      }
    }
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <Panel
      number="11"
      title="FITNESS"
      topRight={<Mono>TODAY</Mono>}
      bottomCTA={
        <Link href="/fitness" className="hover:text-ink-4 transition-colors">
          VIEW WORKOUT →
        </Link>
      }
    >
      {data === null ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3">
          Loading…
        </div>
      ) : data.sessions.length === 0 ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 leading-relaxed">
          {data.programme_name
            ? "Rest day."
            : "No programme active. Set one up in Fitness → Phases."}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-ink-2">
          {data.sessions.map((s) => (
            <li
              key={`${s.slot}-${s.programme_session_id}`}
              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span aria-hidden className="text-base shrink-0">
                {KIND_ICON[s.kind] ?? "·"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                  {SLOT_LABEL[s.slot]}
                </div>
                <div className="text-sm text-ink-4 truncate">{s.name}</div>
              </div>
              <span
                className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${
                  s.logged
                    ? "border-ok/40 bg-ok/15 text-ok"
                    : "border-ink-2 bg-ink-0/40 text-ink-3"
                }`}
              >
                {s.logged ? "✓ LOGGED" : "▢ OPEN"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
