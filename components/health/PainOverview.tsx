"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import type { ExercisePainLog, FeelRating } from "@/lib/fitness/types";

const FEEL_TONE: Record<FeelRating, string> = {
  great: "text-ok",
  good: "text-ok",
  ok: "text-ink-3",
  mild: "text-warn",
  moderate: "text-warn",
  painful: "text-danger",
  stopped: "text-danger",
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function PainOverview() {
  const [standalone, setStandalone] = useState<ExercisePainLog[] | null>(null);
  const [session, setSession] = useState<ExercisePainLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/fitness/pain-logs?exercise_name=standalone").then((r) =>
        r.json(),
      ),
      fetch("/api/fitness/pain-logs?exercise_name=session").then((r) =>
        r.json(),
      ),
    ])
      .then(
        ([s, x]: [
          { pain_logs?: ExercisePainLog[] },
          { pain_logs?: ExercisePainLog[] },
        ]) => {
          if (cancelled) return;
          setStandalone(Array.isArray(s.pain_logs) ? s.pain_logs : []);
          setSession(Array.isArray(x.pain_logs) ? x.pain_logs : []);
        },
      )
      .catch(() => {
        if (cancelled) return;
        setStandalone([]);
        setSession([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Pain tracking
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Standalone pain captures + the pain notes attached to recent workout
          sessions.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Standalone logs
        </h2>
        <PainList logs={standalone} emptyText="No standalone pain captures yet." />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Session pain notes
          </h2>
          <Link
            href="/fitness/history"
            className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
          >
            FITNESS HISTORY →
          </Link>
        </div>
        <PainList logs={session} emptyText="No session-level pain notes yet." />
      </section>
    </div>
  );
}

function PainList({
  logs,
  emptyText,
}: {
  logs: ExercisePainLog[] | null;
  emptyText: string;
}) {
  if (logs === null) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
        Loading…
      </div>
    );
  }
  if (logs.length === 0) {
    return (
      <div className="rounded-md bg-ink-1 p-6 text-center text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
        {emptyText}
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-ink-2/60 rounded-md bg-ink-1 border border-ink-2">
      {logs.map((l) => {
        const tone = l.feel_rating ? FEEL_TONE[l.feel_rating] : "text-ink-3";
        const regions = (l.pain_regions ?? []).join(", ");
        return (
          <li key={l.id} className="flex items-start gap-3 px-3 py-2">
            <Mono className={`text-[11px] tabular-nums shrink-0 ${tone}`}>
              {l.severity ?? "—"}/10
            </Mono>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink-4 truncate">
                {regions || "(no region)"}
                {l.feel_rating && (
                  <span className={`ml-2 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] ${tone}`}>
                    {l.feel_rating}
                  </span>
                )}
              </div>
              {l.notes && (
                <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-0.5 line-clamp-2">
                  {l.notes}
                </div>
              )}
            </div>
            <Mono className="text-[10px] text-ink-3 shrink-0">
              {formatDateTime(l.logged_at)}
            </Mono>
          </li>
        );
      })}
    </ul>
  );
}
