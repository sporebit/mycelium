"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { PrivateValue } from "@/components/PrivateValue";
import type {
  FinanceData,
  FinanceHistoryPoint,
} from "@/lib/finance/types";
import {
  breakDown,
  fmtCurrency,
  fmtPercent,
  fmtSigned,
  liveTone,
  relativeTime,
} from "@/lib/finance/helpers";

type SnapshotResponse =
  | (FinanceData & { date?: string })
  | { snapshot: null; last_refreshed_at: null; source: null };

function KpiBox({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  // Plain "—" placeholder should stay visible even in privacy mode; only
  // wrap real values.
  const isPlaceholder = value === "—";
  return (
    <div className="rounded-xl border border-ink-2 bg-ink-1/60 backdrop-blur-xl p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </div>
      <Mono className="block text-2xl text-ink-4 mt-2">
        {isPlaceholder ? value : <PrivateValue>{value}</PrivateValue>}
      </Mono>
      {hint && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
          {hint}
        </div>
      )}
    </div>
  );
}

function CategoryPanel({
  number,
  title,
  total,
  items,
  netWorth,
  currency,
  tone = "ok",
}: {
  number: string;
  title: string;
  total: number;
  items: { name: string; value: number }[];
  netWorth: number;
  currency: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const share = netWorth !== 0 ? (total / netWorth) * 100 : 0;
  const toneClass =
    tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ok";

  return (
    <Panel
      number={number}
      title={title}
      topRight={
        <Mono>
          <PrivateValue>{fmtPercent(share, 1)}</PrivateValue> OF NW
        </Mono>
      }
    >
      <Mono className={`block text-xl ${toneClass}`}>
        <PrivateValue>{fmtCurrency(total, currency)}</PrivateValue>
      </Mono>
      <ul className="mt-3 flex flex-col divide-y divide-ink-2">
        {items.length === 0 ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-2">
            None
          </li>
        ) : (
          items.map((c, i) => (
            <li key={`${c.name}-${i}`} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-ink-4 truncate flex-1 min-w-0 pr-2">
                {c.name}
              </span>
              <Mono className="text-[12px] text-ink-3 shrink-0">
                <PrivateValue>{fmtCurrency(c.value, currency)}</PrivateValue>
              </Mono>
            </li>
          ))
        )}
      </ul>
    </Panel>
  );
}

type MonthlyRow = {
  period: string; // YYYY-MM
  netWorth: number;
  liquid: number;
  invested: number;
  liabilities: number;
  delta: number | null;
};

function groupByMonth(history: FinanceHistoryPoint[]): MonthlyRow[] {
  // Newest-first input. For each YYYY-MM keep the FIRST occurrence (= latest snapshot of that month).
  const byMonth = new Map<string, FinanceHistoryPoint>();
  for (const p of history) {
    const ym = p.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, p);
  }
  const ordered = [...byMonth.entries()].sort(([a], [b]) => (a < b ? 1 : -1));

  const rows: MonthlyRow[] = ordered.map(([ym, p]) => {
    const bd = breakDown(p.snapshot);
    return {
      period: ym,
      netWorth: p.snapshot.net_worth,
      liquid: bd.liquid.total,
      invested: bd.invested.total,
      liabilities: bd.liabilities.total,
      delta: null,
    };
  });
  // Compute delta vs prior (rows are newest-first → prior is the next row)
  for (let i = 0; i < rows.length; i++) {
    const prior = rows[i + 1];
    rows[i].delta = prior ? rows[i].netWorth - prior.netWorth : null;
  }
  return rows;
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

export function FinancePageClient() {
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [history, setHistory] = useState<FinanceHistoryPoint[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [snapRes, histRes] = await Promise.all([
          fetch("/api/finance/snapshot", { cache: "no-store" }),
          fetch("/api/finance/history?months=24", { cache: "no-store" }),
        ]);
        if (!mounted) return;
        if (snapRes.ok) {
          setData((await snapRes.json()) as SnapshotResponse);
        } else if (snapRes.status === 503) {
          setError("Finance not configured");
        } else {
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
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
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
      } else if (!res.ok) {
        setError(j.error ?? `Refresh failed (${res.status})`);
      } else {
        setData(j as SnapshotResponse);
        const histRes = await fetch("/api/finance/history?months=24", {
          cache: "no-store",
        });
        if (histRes.ok) {
          const hj = (await histRes.json()) as { history?: FinanceHistoryPoint[] };
          setHistory(Array.isArray(hj.history) ? hj.history : []);
        }
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

  const bd = useMemo(() => (snapshot ? breakDown(snapshot) : null), [snapshot]);
  const monthly = useMemo(
    () => (history ? groupByMonth(history) : []),
    [history]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Net worth
          </div>
          {snapshot ? (
            <>
              <Mono className="block text-4xl text-ink-4 mt-1">
                <PrivateValue>
                  {fmtCurrency(snapshot.net_worth, snapshot.currency)}
                </PrivateValue>
              </Mono>
              <div
                className={`text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] mt-1 ${toneClass}`}
              >
                ● {relativeTime(lastRefreshed)}
                {snapshot.as_of && (
                  <span className="ml-2 text-ink-3">as of {snapshot.as_of}</span>
                )}
                {data && "source" in data && data.source && (
                  <span className="ml-2 text-ink-3">via {data.source}</span>
                )}
              </div>
              {snapshot.notes && (
                <div className="mt-2 text-xs text-ink-3 italic font-[family-name:var(--font-display)] max-w-md">
                  ⓘ {snapshot.notes}
                </div>
              )}
            </>
          ) : data === null ? (
            <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-2">
              Loading…
            </div>
          ) : (
            <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-2">
              No snapshot yet — tap Refresh to fetch from your sheet.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors shrink-0"
        >
          {refreshing ? "REFRESHING…" : "↻ REFRESH"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {/* KPI boxes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiBox label="Runway" value="—" hint="needs burn rate" />
        <KpiBox label="Income / mo" value="—" hint="awaiting wiring" />
        <KpiBox label="Burn / mo" value="—" hint="awaiting wiring" />
      </div>

      {/* Category panels */}
      {snapshot && bd && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <CategoryPanel
            number="A1"
            title="LIQUID CASH"
            total={bd.liquid.total}
            items={bd.liquid.items}
            netWorth={snapshot.net_worth}
            currency={snapshot.currency}
            tone="ok"
          />
          <CategoryPanel
            number="A2"
            title="INVESTED ASSETS"
            total={bd.invested.total}
            items={bd.invested.items}
            netWorth={snapshot.net_worth}
            currency={snapshot.currency}
            tone="ok"
          />
          <CategoryPanel
            number="A3"
            title="LIABILITIES"
            total={bd.liabilities.total}
            items={bd.liabilities.items}
            netWorth={snapshot.net_worth}
            currency={snapshot.currency}
            tone="danger"
          />
        </div>
      )}

      {/* History table */}
      <Panel number="H1" title="SNAPSHOT HISTORY" topRight={<Mono>24 MONTHS</Mono>}>
        {history === null ? (
          <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-6 text-center">
            Loading…
          </div>
        ) : monthly.length === 0 ? (
          <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-6 text-center">
            No history yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] border-b border-ink-2">
                  <th className="text-left py-2 pr-3">Period</th>
                  <th className="text-right py-2 px-3">Net Worth</th>
                  <th className="text-right py-2 px-3">Liquid</th>
                  <th className="text-right py-2 px-3">Invested</th>
                  <th className="text-right py-2 px-3">Liabilities</th>
                  <th className="text-right py-2 pl-3">Δ vs Prior</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((r) => {
                  const currency = snapshot?.currency ?? "GBP";
                  return (
                    <tr key={r.period} className="border-b border-ink-2">
                      <td className="py-2 pr-3 text-ink-4">{fmtMonth(r.period)}</td>
                      <td className="text-right py-2 px-3">
                        <Mono className="text-ink-4">
                          <PrivateValue>
                            {fmtCurrency(r.netWorth, currency)}
                          </PrivateValue>
                        </Mono>
                      </td>
                      <td className="text-right py-2 px-3">
                        <Mono className="text-ink-3">
                          <PrivateValue>
                            {fmtCurrency(r.liquid, currency)}
                          </PrivateValue>
                        </Mono>
                      </td>
                      <td className="text-right py-2 px-3">
                        <Mono className="text-ink-3">
                          <PrivateValue>
                            {fmtCurrency(r.invested, currency)}
                          </PrivateValue>
                        </Mono>
                      </td>
                      <td className="text-right py-2 px-3">
                        <Mono className="text-ink-3">
                          <PrivateValue>
                            {fmtCurrency(r.liabilities, currency)}
                          </PrivateValue>
                        </Mono>
                      </td>
                      <td className="text-right py-2 pl-3">
                        {r.delta === null ? (
                          <Mono className="text-ink-3">—</Mono>
                        ) : (
                          <Mono
                            className={
                              r.delta >= 0 ? "text-ok" : "text-danger"
                            }
                          >
                            <PrivateValue>
                              {fmtSigned(r.delta, currency)}
                            </PrivateValue>
                          </Mono>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
