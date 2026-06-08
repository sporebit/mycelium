"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { Mono } from "@/components/dashboard/Mono";
import { Money, PrivateText } from "@/components/finance/Money";
import { CATEGORY_COLOURS } from "@/lib/finance/taxonomy";

type CategoryRow = { category: string; total: number };
type MonthlyRow = { month: string; category: string; total: number };

type DatePreset = { label: string; from: string; to: string };

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPresets(): DatePreset[] {
  const today = new Date();
  const todayIso = isoDate(today);

  const d30 = new Date(today);
  d30.setDate(d30.getDate() - 29);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearStart = new Date(today.getFullYear(), 0, 1);

  const thisApr6 = new Date(today.getFullYear(), 3, 6);
  const taxYearStart =
    today >= thisApr6 ? thisApr6 : new Date(today.getFullYear() - 1, 3, 6);
  const lastTaxStart = new Date(taxYearStart.getFullYear() - 1, 3, 6);
  const lastTaxEnd = new Date(taxYearStart.getFullYear(), 3, 5);

  return [
    { label: "30 days", from: isoDate(d30), to: todayIso },
    { label: "This month", from: isoDate(monthStart), to: todayIso },
    { label: "This year", from: isoDate(yearStart), to: todayIso },
    { label: "This tax year", from: isoDate(taxYearStart), to: todayIso },
    {
      label: "Last tax year",
      from: isoDate(lastTaxStart),
      to: isoDate(lastTaxEnd),
    },
  ];
}

function shortMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export function AnalysisClient() {
  const presets = useMemo(() => getPresets(), []);
  const [activePreset, setActivePreset] = useState(presets[0].label);
  const [dateFrom, setDateFrom] = useState(presets[0].from);
  const [dateTo, setDateTo] = useState(presets[0].to);

  const [catData, setCatData] = useState<CategoryRow[] | null>(null);
  const [monthData, setMonthData] = useState<MonthlyRow[] | null>(null);

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setCatData(null); });
    fetch("/api/finance/analysis/by-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: dateFrom, end: dateTo }),
    })
      .then((r) => r.json())
      .then((d: CategoryRow[]) => {
        if (!cancelled) setCatData(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setCatData([]);
      });
    return () => { cancelled = true; };
  }, [dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/analysis/monthly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthsBack: 6 }),
    })
      .then((r) => r.json())
      .then((d: MonthlyRow[]) => {
        if (!cancelled) setMonthData(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setMonthData([]);
      });
    return () => { cancelled = true; };
  }, []);

  const totalSpend = useMemo(
    () => (catData ?? []).reduce((s, r) => s + Number(r.total), 0),
    [catData],
  );

  const topCategory = catData?.[0]?.category ?? "—";
  const categoryCount = catData?.length ?? 0;

  // Pivot monthly data: { month, Groceries: 42, Fuel: 18, ... }
  const { pivoted, allCategories } = useMemo(() => {
    if (!monthData || monthData.length === 0)
      return { pivoted: [], allCategories: [] };
    const months = new Map<string, Record<string, string | number>>();
    const cats = new Set<string>();
    for (const row of monthData) {
      cats.add(row.category);
      let entry = months.get(row.month);
      if (!entry) {
        entry = { month: row.month };
        months.set(row.month, entry);
      }
      entry[row.category] = Number(row.total);
    }
    const sorted = [...months.values()].sort((a, b) =>
      String(a.month).localeCompare(String(b.month)),
    );
    return { pivoted: sorted, allCategories: [...cats] };
  }, [monthData]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Spending analysis
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Where the money actually goes.
        </p>
      </header>

      {/* Period selector */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setDateFrom(p.from);
              setDateTo(p.to);
              setActivePreset(p.label);
            }}
            className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.08em] transition-colors ${
              activePreset === p.label
                ? "bg-accent/15 text-accent border border-accent/30"
                : "bg-ink-1/60 text-ink-3 border border-ink-2 hover:text-ink-4 hover:border-ink-3"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total spend" loading={catData === null}>
          <Mono className="text-lg text-danger">
            <PrivateText>
              <Money value={totalSpend} format="balance" />
            </PrivateText>
          </Mono>
        </SummaryCard>
        <SummaryCard label="Top category" loading={catData === null}>
          <span className="text-sm text-text-0">{topCategory}</span>
        </SummaryCard>
        <SummaryCard label="Categories" loading={catData === null}>
          <Mono className="text-lg text-ink-4">{categoryCount}</Mono>
        </SummaryCard>
        <SummaryCard label="Daily avg" loading={catData === null}>
          <Mono className="text-lg text-ink-4">
            <PrivateText>
              <DailyAvg total={totalSpend} from={dateFrom} to={dateTo} />
            </PrivateText>
          </Mono>
        </SummaryCard>
      </div>

      {/* Category breakdown — horizontal bars */}
      <section className="rounded-md bg-ink-1 border border-ink-2 p-3">
        <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
          By category
        </h3>
        {catData === null ? (
          <Loading />
        ) : catData.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: Math.max(200, catData.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={catData}
                layout="vertical"
                margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
              >
                <XAxis
                  type="number"
                  tick={{ fill: "var(--ink-3)", fontSize: 10 }}
                  axisLine={{ stroke: "var(--ink-2)" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `£${v.toLocaleString()}`}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={140}
                  tick={{ fill: "var(--ink-4)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--ink-2)" }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--ink-1)",
                    border: "1px solid var(--ink-2)",
                    fontSize: 11,
                  }}
                  formatter={(v) => [`£${Number(v).toFixed(2)}`, "Total"]}
                />
                <Bar dataKey="total" radius={[0, 3, 3, 0]}>
                  {catData.map((row) => (
                    <Cell
                      key={row.category}
                      fill={CATEGORY_COLOURS[row.category] ?? "var(--ink-3)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Monthly trend — stacked bars */}
      <section className="rounded-md bg-ink-1 border border-ink-2 p-3">
        <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
          Monthly trend (last 6 months)
        </h3>
        {monthData === null ? (
          <Loading />
        ) : pivoted.length === 0 ? (
          <Empty />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pivoted}
                margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
              >
                <XAxis
                  dataKey="month"
                  tick={{ fill: "var(--ink-3)", fontSize: 10 }}
                  axisLine={{ stroke: "var(--ink-2)" }}
                  tickLine={false}
                  tickFormatter={shortMonth}
                />
                <YAxis
                  tick={{ fill: "var(--ink-3)", fontSize: 10 }}
                  axisLine={{ stroke: "var(--ink-2)" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `£${v.toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--ink-1)",
                    border: "1px solid var(--ink-2)",
                    fontSize: 11,
                  }}
                  formatter={(v) => `£${Number(v).toFixed(2)}`}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {allCategories.map((cat) => (
                  <Bar
                    key={cat}
                    dataKey={cat}
                    stackId="spend"
                    fill={CATEGORY_COLOURS[cat] ?? "var(--ink-3)"}
                    radius={[0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Category table */}
      {catData && catData.length > 0 && (
        <section className="rounded-md bg-ink-1 border border-ink-2 p-3">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
            Breakdown
          </h3>
          <ul className="flex flex-col divide-y divide-ink-2/60">
            {catData.map((row) => (
              <li
                key={row.category}
                className="flex items-center justify-between py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        CATEGORY_COLOURS[row.category] ?? "var(--ink-3)",
                    }}
                  />
                  <span className="text-sm text-ink-4 truncate">
                    {row.category}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Mono className="text-[11px] text-ink-3 tabular-nums">
                    {totalSpend > 0
                      ? `${((Number(row.total) / totalSpend) * 100).toFixed(1)}%`
                      : "—"}
                  </Mono>
                  <Mono className="text-sm text-text-0 tabular-nums">
                    <PrivateText>
                      <Money value={Number(row.total)} format="balance" />
                    </PrivateText>
                  </Mono>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  loading,
  children,
}: {
  label: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-ink-1 border border-ink-2 px-4 py-3 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      {loading ? (
        <span className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          …
        </span>
      ) : (
        children
      )}
    </div>
  );
}

function DailyAvg({
  total,
  from,
  to,
}: {
  total: number;
  from: string;
  to: string;
}) {
  if (!from || !to || total === 0) return <>—</>;
  const days = Math.max(
    1,
    Math.ceil(
      (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
    ) + 1,
  );
  return <Money value={total / days} format="balance" />;
}

function Loading() {
  return (
    <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
      Loading…
    </div>
  );
}

function Empty() {
  return (
    <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
      No data for this period.
    </div>
  );
}
