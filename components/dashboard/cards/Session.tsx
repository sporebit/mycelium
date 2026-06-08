"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { CaptureBox } from "../CaptureBox";
import { OPERATOR } from "@/lib/config/operator";
import type { CardWidth } from "@/lib/dashboard/card-registry";

type TopTask = {
  id: string;
  title: string;
  timeEstimateMin: number | null;
  entityName: string | null;
};

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function Session({ width = 1 }: { width?: CardWidth } = {}) {
  const [now, setNow] = useState<Date>(() => new Date());

  const [oneThing, setOneThing] = useState<string>("");
  const [oneThingLoaded, setOneThingLoaded] = useState(false);
  const [editingOneThing, setEditingOneThing] = useState(false);
  const [oneThingDraft, setOneThingDraft] = useState("");
  const [savingOneThing, setSavingOneThing] = useState(false);
  const oneThingRef = useRef<HTMLInputElement | null>(null);

  const [topTasks, setTopTasks] = useState<TopTask[] | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/daily-log/today")
      .then((r) => r.json())
      .then((j: { notes?: { todaysOneThing?: string } }) => {
        if (!mounted) return;
        setOneThing(
          typeof j?.notes?.todaysOneThing === "string" ? j.notes.todaysOneThing : ""
        );
        setOneThingLoaded(true);
      })
      .catch(() => mounted && setOneThingLoaded(true));

    fetch("/api/tasks/top-today")
      .then((r) => r.json())
      .then((j: { tasks?: TopTask[] }) => {
        if (!mounted) return;
        setTopTasks(Array.isArray(j?.tasks) ? j.tasks : []);
      })
      .catch(() => mounted && setTopTasks([]));

    return () => {
      mounted = false;
    };
  }, []);

  function beginEditOneThing() {
    setOneThingDraft(oneThing);
    setEditingOneThing(true);
    queueMicrotask(() => {
      oneThingRef.current?.focus();
      oneThingRef.current?.setSelectionRange(oneThing.length, oneThing.length);
    });
  }

  async function saveOneThing() {
    if (savingOneThing) return;
    if (oneThingDraft === oneThing) {
      setEditingOneThing(false);
      return;
    }
    setSavingOneThing(true);
    try {
      const res = await fetch("/api/daily-log/today", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todaysOneThing: oneThingDraft }),
      });
      if (res.ok) {
        setOneThing(oneThingDraft);
        setEditingOneThing(false);
      }
    } catch {
      /* swallow */
    } finally {
      setSavingOneThing(false);
    }
  }

  function onKeyOneThing(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveOneThing();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOneThingDraft(oneThing);
      setEditingOneThing(false);
    }
  }

  return (
    <Panel
      borderless
      title="SESSION"
      status="ACTIVE"
      statusTone="ok"
      topRight={
        <span suppressHydrationWarning>{fmtDate(now).toUpperCase()}</span>
      }
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <h1
            className="font-[family-name:var(--font-display)] italic text-ink-4 leading-tight"
            style={{ fontSize: "clamp(28px, 3.4vw, 44px)" }}
            suppressHydrationWarning
          >
            {greeting(now)}, {OPERATOR.firstName}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            Session opened. Capture anything below.
          </p>
        </div>

        <div className="text-right">
          <div
            className="font-[family-name:var(--font-mono)] tabular-nums text-ink-4 leading-none"
            style={{ fontSize: "clamp(28px, 3vw, 40px)" }}
            suppressHydrationWarning
          >
            {fmtTime(now)}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
            Local · {OPERATOR.timezone}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-ink-2 bg-ink-0/30 px-4 py-3 flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0">
          Today I will
        </span>
        {editingOneThing ? (
          <input
            ref={oneThingRef}
            type="text"
            value={oneThingDraft}
            onChange={(e) => setOneThingDraft(e.target.value)}
            onKeyDown={onKeyOneThing}
            onBlur={saveOneThing}
            placeholder="Set today's one thing…"
            className="flex-1 bg-transparent outline-none text-sm text-ink-4 placeholder:text-ink-3 italic font-[family-name:var(--font-display)]"
            disabled={savingOneThing}
          />
        ) : (
          <button
            type="button"
            onClick={beginEditOneThing}
            className="flex-1 text-left text-sm italic font-[family-name:var(--font-display)] hover:opacity-75 transition-opacity truncate"
            title="Click to edit"
          >
            {oneThingLoaded && oneThing ? (
              <span className="text-ink-4">{oneThing}</span>
            ) : (
              <span className="text-ink-3">Set today&apos;s one thing…</span>
            )}
          </button>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Top Tasks Today
          </span>
          {topTasks && topTasks.length > 0 && (
            <Mono className="text-[10px] text-ink-3">
              {topTasks.length} CRITICAL
            </Mono>
          )}
        </div>
        {topTasks === null ? (
          <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
            Loading…
          </div>
        ) : topTasks.length === 0 ? (
          <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
            No critical tasks for today
          </div>
        ) : (
          <ul
            className={
              width >= 3
                ? "grid grid-cols-2 gap-x-6"
                : "flex flex-col divide-y divide-ink-2"
            }
          >
            {topTasks.map((t) => (
              <li
                key={t.id}
                className={`py-2 flex items-center gap-3 ${
                  width >= 3 ? "border-b border-ink-2 last:border-b-0" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-danger shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-4 truncate">{t.title}</div>
                  {(t.timeEstimateMin !== null || t.entityName) && (
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5 flex items-center gap-2">
                      {t.timeEstimateMin !== null && (
                        <Mono>{t.timeEstimateMin}M</Mono>
                      )}
                      {t.timeEstimateMin !== null && t.entityName && <span>·</span>}
                      {t.entityName && <span>{t.entityName}</span>}
                    </div>
                  )}
                </div>
                <Link
                  href="/organisation"
                  className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] shrink-0"
                >
                  → TASKS
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <CaptureBox />
      </div>
    </Panel>
  );
}
