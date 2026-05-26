"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { PrivateValue } from "@/components/PrivateValue";
import { usePrivacy } from "@/lib/context/PrivacyContext";
import type {
  FinanceData,
  FinanceHistoryPoint,
} from "@/lib/finance/types";
import {
  fmtCurrency,
  fmtPercent,
  fmtSigned,
  findClosestBefore,
  liveStatusLabel,
  liveTone,
  relativeTime,
} from "@/lib/finance/helpers";
import { previousDateKey, localDateKey } from "@/lib/util/date";

type SnapshotResponse =
  | (FinanceData & { date?: string })
  | { snapshot: null; last_refreshed_at: null; source: null };

function Sparkline({ points }: { points: number[] }) {
  const { financeHidden } = usePrivacy();
  if (points.length < 2) {
    return (
      <div className="h-12 rounded-lg border border-ink-2 bg-ink-0/40" />
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = 200 / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = i * stepX;
      const y = 44 - ((p - min) / range) * 36 - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const fill = `${d} L200,48 L0,48 Z`;

  return (
    <div
      className="h-12 rounded-lg border border-ink-2 bg-ink-0/40 relative overflow-hidden"
      style={financeHidden ? { filter: "blur(6px)" } : undefined}
      aria-hidden={financeHidden}
    >
      <svg
        viewBox="0 0 200 48"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="fp-spark" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--glow-0)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--glow-0)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#fp-spark)" />
        <path d={d} fill="none" stroke="var(--glow-0)" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

export function FinancePulse() {
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [history, setHistory] = useState<FinanceHistoryPoint[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAll() {
      try {
        const [snapRes, histRes] = await Promise.all([
          fetch("/api/finance/snapshot", { cache: "no-store" }),
          fetch("/api/finance/history?months=2", { cache: "no-store" }),
        ]);
        if (!mounted) return;
        if (snapRes.ok) {
          setData((await snapRes.json()) as SnapshotResponse);
        } else if (snapRes.status !== 503) {
          setError(`Load failed (${snapRes.status})`);
        }
        if (histRes.ok) {
          const j = (await histRes.json()) as { history?: FinanceHistoryPoint[] };
          setHistory(Array.isArray(j.history) ? j.history : []);
        }
      } catch {
        if (mounted) setError("Network error");
      }
    }

    void loadAll();
    const onFocus = () => void loadAll();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/finance/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual" }),
      });
      const j = await res.json();
      if (res.status === 429) {
        setError(`Rate limited — try again in ${j.retry_after_s ?? "<60"}s`);
        if (j.snapshot) setData(j as SnapshotResponse);
        return;
      }
      if (!res.ok) {
        setError(j.error ?? `Refresh failed (${res.status})`);
        return;
      }
      setData(j as SnapshotResponse);
      // Re-fetch history so the new point shows in the sparkline
      const histRes = await fetch("/api/finance/history?months=2", {
        cache: "no-store",
      });
      if (histRes.ok) {
        const hj = (await histRes.json()) as { history?: FinanceHistoryPoint[] };
        setHistory(Array.isArray(hj.history) ? hj.history : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const snapshot = data && data.snapshot ? data.snapshot : null;
  const lastRefreshed =
    data && "last_refreshed_at" in data ? data.last_refreshed_at : null;
  const tone = liveTone(lastRefreshed);
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "text-ink-3";

  const deltas = useMemo(() => {
    if (!snapshot || !history || history.length === 0) return null;
    const today = localDateKey();
    const yesterdayKey = previousDateKey(today);
    let monthAgoKey = today;
    for (let i = 0; i < 30; i++) monthAgoKey = previousDateKey(monthAgoKey);

    const prevDay = findClosestBefore(history, yesterdayKey);
    const prevMonth = findClosestBefore(history, monthAgoKey);

    const dayDelta = prevDay
      ? snapshot.net_worth - prevDay.snapshot.net_worth
      : null;
    const monthDelta = prevMonth
      ? snapshot.net_worth - prevMonth.snapshot.net_worth
      : null;
    const dayPct =
      prevDay && prevDay.snapshot.net_worth !== 0
        ? ((snapshot.net_worth - prevDay.snapshot.net_worth) /
            Math.abs(prevDay.snapshot.net_worth)) *
          100
        : null;
    const monthPct =
      prevMonth && prevMonth.snapshot.net_worth !== 0
        ? ((snapshot.net_worth - prevMonth.snapshot.net_worth) /
            Math.abs(prevMonth.snapshot.net_worth)) *
          100
        : null;

    return { dayDelta, monthDelta, dayPct, monthPct };
  }, [snapshot, history]);

  const sparkPoints = useMemo(() => {
    if (!history || history.length === 0) return [];
    return [...history]
      .reverse()
      .slice(-30)
      .map((p) => p.snapshot.net_worth);
  }, [history]);

  return (
    <Panel
      borderless
      number="07"
      title="FINANCE PULSE"
      status={liveStatusLabel(tone)}
      statusTone={tone}
      topRight={
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="text-ink-3 hover:text-ink-4 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={
            lastRefreshed
              ? `Refreshed ${relativeTime(lastRefreshed)}`
              : "Refresh from sheet"
          }
        >
          {refreshing ? "…" : "↻"}
        </button>
      }
    >
      {error && (
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {data === null ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3">
          Loading…
        </div>
      ) : !snapshot ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 leading-relaxed">
          No snapshot yet — tap ↻ to fetch from your sheet.
        </div>
      ) : (
        <>
          <div>
            <div className="card-eyebrow">Net worth</div>
            <div className="card-hero-primary mt-1.5 tabular-nums">
              <PrivateValue>
                {fmtCurrency(snapshot.net_worth, snapshot.currency)}
              </PrivateValue>
            </div>
            <div
              className={`text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] mt-1 ${toneClass}`}
            >
              ● {relativeTime(lastRefreshed)}
              {data && "source" in data && data.source && (
                <span className="ml-2 text-ink-3">
                  via {data.source}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3">
            <Sparkline points={sparkPoints} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                Daily
              </div>
              {deltas && deltas.dayDelta !== null ? (
                <>
                  <Mono
                    className={`block text-sm mt-1 ${
                      deltas.dayDelta >= 0 ? "text-ok" : "text-danger"
                    }`}
                  >
                    <PrivateValue>
                      {fmtSigned(deltas.dayDelta, snapshot.currency)}
                    </PrivateValue>
                  </Mono>
                  {deltas.dayPct !== null && (
                    <Mono
                      className={`block text-[11px] ${
                        deltas.dayDelta >= 0 ? "text-ok/70" : "text-danger/70"
                      }`}
                    >
                      <PrivateValue>{fmtPercent(deltas.dayPct)}</PrivateValue>
                    </Mono>
                  )}
                </>
              ) : (
                <Mono className="block text-sm text-ink-3 mt-1">—</Mono>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                Monthly
              </div>
              {deltas && deltas.monthDelta !== null ? (
                <>
                  <Mono
                    className={`block text-sm mt-1 ${
                      deltas.monthDelta >= 0 ? "text-ok" : "text-danger"
                    }`}
                  >
                    <PrivateValue>
                      {fmtSigned(deltas.monthDelta, snapshot.currency)}
                    </PrivateValue>
                  </Mono>
                  {deltas.monthPct !== null && (
                    <Mono
                      className={`block text-[11px] ${
                        deltas.monthDelta >= 0 ? "text-ok/70" : "text-danger/70"
                      }`}
                    >
                      <PrivateValue>{fmtPercent(deltas.monthPct)}</PrivateValue>
                    </Mono>
                  )}
                </>
              ) : (
                <Mono className="block text-sm text-ink-3 mt-1">—</Mono>
              )}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
