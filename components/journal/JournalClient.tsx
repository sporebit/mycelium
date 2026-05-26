"use client";

import { useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import { Panel } from "@/components/dashboard/Panel";
import { localDateKey, previousDateKey } from "@/lib/util/date";
import type { JournalGroup } from "@/lib/journal/types";

const MOOD_TONE: Record<string, string> = {
  energised: "bg-ok/15 text-ok border-ok/40",
  calm: "bg-ok/10 text-ok border-ok/30",
  reflective: "bg-accent/15 text-accent border-accent/40",
  grateful: "bg-accent/10 text-accent border-accent/30",
  tired: "bg-ink-2 text-ink-3 border-ink-2",
  anxious: "bg-warn/15 text-warn border-warn/40",
  frustrated: "bg-danger/15 text-danger border-danger/40",
  neutral: "bg-ink-2 text-ink-3 border-ink-2",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtDateHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function defaultFromKey(): string {
  let d = localDateKey();
  for (let i = 0; i < 30; i++) d = previousDateKey(d);
  return d;
}

type Stats = { entry_count: number; days_written: number };

export function JournalClient() {
  const [groups, setGroups] = useState<JournalGroup[] | null>(null);
  const [stats, setStats] = useState<Stats>({
    entry_count: 0,
    days_written: 0,
  });
  const [from, setFrom] = useState<string>(() => defaultFromKey());
  const [to, setTo] = useState<string>(() => localDateKey());
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summarising, setSummarising] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [from, to, q]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/journal?${queryString}`);
        const j = (await res.json()) as {
          groups?: JournalGroup[];
          stats?: Stats;
          error?: string;
        };
        if (!mounted) return;
        if (j.error) {
          setError(j.error);
          setGroups([]);
          return;
        }
        setGroups(Array.isArray(j.groups) ? j.groups : []);
        if (j.stats) setStats(j.stats);
      } catch {
        if (mounted) {
          setError("Network error");
          setGroups([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [queryString]);

  async function generateDaySummary(group: JournalGroup) {
    if (group.entries.length === 0) return;
    const id = group.entries[0].id;
    setSummarising(group.date);
    try {
      const res = await fetch(`/api/journal/${id}/summary`, {
        method: "POST",
      });
      const j = (await res.json()) as {
        summary?: { summary?: string };
        error?: string;
      };
      if (!res.ok || !j.summary?.summary) {
        setError(j.error ?? "Summary failed");
        return;
      }
      // Patch the group's summary in place
      setGroups((cur) =>
        (cur ?? []).map((g) =>
          g.date === group.date ? { ...g, summary: j.summary!.summary! } : g
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summary failed");
    } finally {
      setSummarising(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Journal
            </h1>
            <p className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4 mt-1">
              {stats.entry_count}{" "}
              {stats.entry_count === 1 ? "entry" : "entries"} ·{" "}
              {stats.days_written}{" "}
              {stats.days_written === 1 ? "day" : "days"} written
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search entries…"
            className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-sm text-ink-4 placeholder:text-ink-3 outline-none focus:border-ink-3 transition-colors w-64"
          />
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            <span>From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1 outline-none focus:border-ink-3"
            />
            <span>To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1 outline-none focus:border-ink-3"
            />
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : groups === null || groups.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center leading-relaxed">
          Your journal is empty. Send a longer voice note to your Telegram bot
          and it&apos;ll appear here when classified as reflection.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <Panel
              key={g.date}
              title={fmtDateHeading(g.date).toUpperCase()}
              topRight={
                g.summary ? (
                  <Mono>SUMMARISED</Mono>
                ) : (
                  <button
                    type="button"
                    onClick={() => generateDaySummary(g)}
                    disabled={summarising === g.date}
                    className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-ink-4 disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
                  >
                    {summarising === g.date
                      ? "GENERATING…"
                      : "GENERATE SUMMARY →"}
                  </button>
                )
              }
            >
              {g.summary && (
                <p className="text-sm italic font-[family-name:var(--font-display)] text-ink-4 leading-relaxed border-l-2 border-accent/40 pl-3 mb-4">
                  {g.summary}
                </p>
              )}
              <ul className="flex flex-col divide-y divide-ink-2">
                {g.entries.map((e) => (
                  <li key={e.id} className="growth-in py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline gap-3 mb-1">
                      <Mono className="text-[11px] text-ink-3 shrink-0">
                        {fmtTime(e.created_at)}
                      </Mono>
                      {e.mood && (
                        <MoodPill mood={e.mood} />
                      )}
                    </div>
                    <p className="text-sm text-ink-4 leading-relaxed whitespace-pre-wrap">
                      {e.raw_text}
                    </p>
                    {e.tags && e.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {e.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-ink-2 bg-ink-0/40 text-ink-3"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function MoodPill({ mood }: { mood: string }) {
  const cls = MOOD_TONE[mood] ?? "bg-ink-2 text-ink-3 border-ink-2";
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${cls}`}
    >
      {mood}
    </span>
  );
}

