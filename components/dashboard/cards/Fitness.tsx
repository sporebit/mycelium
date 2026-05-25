"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

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

  async function startOrResume(s: TodayResponse["sessions"][number]) {
    if (!s.programme_session_id) return;
    setStarting(s.programme_session_id);
    try {
      const r = await fetch("/api/fitness/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programme_session_id: s.programme_session_id,
          slot: s.slot,
          kind: s.kind,
          name: s.name,
          date: data?.date,
        }),
      });
      if (!r.ok) return;
      const j = (await r.json()) as { session_id: string };
      router.push(`/fitness/log/${j.session_id}`);
    } finally {
      setStarting(null);
    }
  }

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
          {data.sessions.map((s) => {
            const label = s.completed
              ? `${s.summary?.sets ?? 0} sets${
                  s.summary?.minutes != null ? ` · ${s.summary.minutes}m` : ""
                }`
              : s.in_progress
              ? "RESUME"
              : "START";
            return (
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
                {s.completed && s.logged_session_id ? (
                  <Link
                    href={`/fitness/log/${s.logged_session_id}`}
                    className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-2 py-1 rounded-md border shrink-0 border-ok/40 bg-ok/15 text-ok"
                  >
                    {label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={starting === s.programme_session_id}
                    onClick={() => void startOrResume(s)}
                    className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-2 py-1 rounded-md border shrink-0 disabled:opacity-40 ${
                      s.in_progress
                        ? "border-warn/40 bg-warn/15 text-warn hover:bg-warn/25"
                        : "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25"
                    }`}
                  >
                    {starting === s.programme_session_id ? "…" : label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
