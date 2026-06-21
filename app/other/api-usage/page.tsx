"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { Mono } from "@/components/dashboard/Mono";

type InternalEstimate = {
  calls: number;
  tokens: number;
  cost_usd: number;
};

type UsageData = {
  anthropic: {
    available: boolean;
    models?: {
      model: string;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
    }[];
    daily?: { date: string; input_tokens: number; output_tokens: number }[];
    total_input?: number;
    total_output?: number;
    total_cost_usd?: number;
    error?: string;
  };
  openai: {
    available: boolean;
    models?: {
      model: string;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
    }[];
    total_cost_usd?: number;
    error?: string;
  };
  internal: {
    vision_scans: number;
    agent_messages: number;
    agent_breakdown: { agent_id: string; count: number }[];
    ai_categorisations: number;
    blood_test_parses: number;
    watch_list_items: number;
    rapidapi_daily_estimate: number;
    estimates: {
      vision: InternalEstimate;
      agents: InternalEstimate;
      categorisation: InternalEstimate;
      blood_tests: InternalEstimate;
    };
    total_est_tokens: number;
    total_est_cost_usd: number;
  };
  cost_summary: {
    anthropic_gbp: number;
    openai_gbp: number;
    streaming_gbp: number;
    total_gbp: number;
    usd_to_gbp: number;
  };
  rapidapi: {
    plan: string;
    daily_limit: number;
    estimated_today: number;
  };
  fetched_at: string;
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--ink-1)",
    border: "1px solid var(--ink-2)",
    borderRadius: 6,
    fontSize: 11,
  },
  labelStyle: { color: "var(--ink-4)" },
};

function gbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function shortModel(m: string): string {
  return m
    .replace("claude-", "")
    .replace("gpt-", "")
    .replace(/-\d{8}$/, "");
}

export default function ApiUsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/other/api-usage");
      if (!r.ok) throw new Error("fetch failed");
      const j = await r.json();
      setData(j);
      setError(null);
    } catch {
      setError("Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchData();
      if (cancelled) return;
    })();
    intervalRef.current = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  function handleRefresh() {
    setLoading(true);
    fetchData();
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            API Usage &amp; Credits
          </h1>
        </header>
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Loading usage data…
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            API Usage &amp; Credits
          </h1>
        </header>
        <div className="text-sm text-red-400">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const internalRows = [
    {
      feature: "Claude Vision (labels)",
      ...data.internal.estimates.vision,
    },
    {
      feature: "Agent conversations",
      ...data.internal.estimates.agents,
    },
    {
      feature: "Spending categorisation",
      ...data.internal.estimates.categorisation,
    },
    {
      feature: "Blood test parsing",
      ...data.internal.estimates.blood_tests,
    },
  ];

  const anthropicBarData = (data.anthropic.models ?? []).map((m) => ({
    model: shortModel(m.model),
    input: m.input_tokens,
    output: m.output_tokens,
  }));

  const dailyData = (data.anthropic.daily ?? []).map((d) => ({
    date: d.date.slice(5),
    tokens: d.input_tokens + d.output_tokens,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            API Usage &amp; Credits
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Monitor token usage, costs, and rate limits across all connected
            services.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors disabled:opacity-40"
        >
          {loading ? "REFRESHING…" : "REFRESH"}
        </button>
      </header>

      {/* SECTION 5 — Cost summary (top, prominent) */}
      <div className="rounded-md bg-accent/10 border border-accent/30 p-5">
        <Mono className="text-[11px] text-accent tracking-[0.18em] mb-3 block">
          MONTHLY COST ESTIMATE
        </Mono>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <CostCell label="Anthropic" value={gbp(data.cost_summary.anthropic_gbp)} />
          <CostCell label="OpenAI" value={gbp(data.cost_summary.openai_gbp)} />
          <CostCell
            label="Streaming API"
            value={gbp(data.cost_summary.streaming_gbp)}
            note="free tier"
          />
          <CostCell
            label="Total"
            value={gbp(data.cost_summary.total_gbp)}
            highlight
          />
        </div>
        <Mono className="text-[9px] text-ink-3 mt-3 block">
          USD→GBP rate: {data.cost_summary.usd_to_gbp} · Auto-refreshes every
          5 min · Last fetched{" "}
          {new Date(data.fetched_at).toLocaleTimeString()}
        </Mono>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1 — Anthropic */}
        <div className="rounded-md bg-ink-1 p-5 flex flex-col gap-4">
          <Mono className="text-[11px] text-ink-3 tracking-[0.18em]">
            ANTHROPIC
          </Mono>
          {data.anthropic.available ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCell
                  label="Input tokens"
                  value={formatTokens(data.anthropic.total_input ?? 0)}
                />
                <StatCell
                  label="Output tokens"
                  value={formatTokens(data.anthropic.total_output ?? 0)}
                />
              </div>
              <div className="text-xs text-ink-3">
                Est. cost:{" "}
                <span className="text-text-1">
                  {usd(data.anthropic.total_cost_usd ?? 0)}
                </span>
              </div>

              {anthropicBarData.length > 0 && (
                <div>
                  <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-2 block">
                    TOKENS BY MODEL
                  </Mono>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={anthropicBarData}
                        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                      >
                        <XAxis
                          dataKey="model"
                          tick={{ fill: "var(--ink-3)", fontSize: 9 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis hide />
                        <Tooltip
                          {...TOOLTIP_STYLE}
                          formatter={(val) => [
                            formatTokens(Number(val)),
                            "",
                          ]}
                        />
                        <Bar
                          dataKey="input"
                          fill="var(--accent)"
                          radius={[3, 3, 0, 0]}
                          name="Input"
                        />
                        <Bar
                          dataKey="output"
                          fill="var(--accent)"
                          opacity={0.4}
                          radius={[3, 3, 0, 0]}
                          name="Output"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {dailyData.length > 0 && (
                <div>
                  <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-2 block">
                    DAILY USAGE (30 DAYS)
                  </Mono>
                  <div className="h-24">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={dailyData}
                        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                      >
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "var(--ink-3)", fontSize: 8 }}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis hide />
                        <Tooltip
                          {...TOOLTIP_STYLE}
                          formatter={(val) => [
                            formatTokens(Number(val)),
                            "tokens",
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="tokens"
                          stroke="var(--accent)"
                          fill="var(--accent)"
                          fillOpacity={0.15}
                          strokeWidth={1.5}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {(data.anthropic.models ?? []).length > 0 && (
                <div>
                  <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-2 block">
                    MODEL BREAKDOWN
                  </Mono>
                  <table className="w-full text-[10px] font-[family-name:var(--font-mono)]">
                    <thead>
                      <tr className="text-ink-3 text-left">
                        <th className="pb-1 font-normal">Model</th>
                        <th className="pb-1 font-normal text-right">
                          Input
                        </th>
                        <th className="pb-1 font-normal text-right">
                          Output
                        </th>
                        <th className="pb-1 font-normal text-right">
                          Est. cost
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.anthropic.models ?? []).map((m) => (
                        <tr
                          key={m.model}
                          className="text-text-1 border-t border-ink-2"
                        >
                          <td className="py-1">{shortModel(m.model)}</td>
                          <td className="py-1 text-right">
                            {formatTokens(m.input_tokens)}
                          </td>
                          <td className="py-1 text-right">
                            {formatTokens(m.output_tokens)}
                          </td>
                          <td className="py-1 text-right">
                            {usd(m.cost_usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <UnavailableCard
              message={
                data.anthropic.error ??
                "Usage data requires billing API access."
              }
              hint="Check console.anthropic.com for current usage."
              href="https://console.anthropic.com/usage"
            />
          )}
        </div>

        {/* SECTION 2 — OpenAI */}
        <div className="rounded-md bg-ink-1 p-5 flex flex-col gap-4">
          <Mono className="text-[11px] text-ink-3 tracking-[0.18em]">
            OPENAI
          </Mono>
          {data.openai.available ? (
            <>
              {(data.openai.models ?? []).length > 0 && (
                <div>
                  <table className="w-full text-[10px] font-[family-name:var(--font-mono)]">
                    <thead>
                      <tr className="text-ink-3 text-left">
                        <th className="pb-1 font-normal">Model</th>
                        <th className="pb-1 font-normal text-right">
                          Input
                        </th>
                        <th className="pb-1 font-normal text-right">
                          Output
                        </th>
                        <th className="pb-1 font-normal text-right">
                          Est. cost
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.openai.models ?? []).map((m) => (
                        <tr
                          key={m.model}
                          className="text-text-1 border-t border-ink-2"
                        >
                          <td className="py-1">{shortModel(m.model)}</td>
                          <td className="py-1 text-right">
                            {formatTokens(m.input_tokens)}
                          </td>
                          <td className="py-1 text-right">
                            {formatTokens(m.output_tokens)}
                          </td>
                          <td className="py-1 text-right">
                            {usd(m.cost_usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-xs text-ink-3">
                Total est. cost:{" "}
                <span className="text-text-1">
                  {usd(data.openai.total_cost_usd ?? 0)}
                </span>
              </div>
              <Mono className="text-[9px] text-ink-3 block">
                Whisper: $0.006/min · GPT-4o-mini: $0.15/MTok input
              </Mono>
            </>
          ) : (
            <UnavailableCard
              message={
                data.openai.error ?? "Usage data requires admin API key."
              }
              hint="Check platform.openai.com for current usage."
              href="https://platform.openai.com/usage"
            />
          )}
        </div>

        {/* SECTION 3 — RapidAPI */}
        <div className="rounded-md bg-ink-1 p-5 flex flex-col gap-4">
          <Mono className="text-[11px] text-ink-3 tracking-[0.18em]">
            RAPIDAPI — STREAMING AVAILABILITY
          </Mono>
          <div className="grid grid-cols-3 gap-3">
            <StatCell label="Plan" value={data.rapidapi.plan} />
            <StatCell
              label="Daily limit"
              value={String(data.rapidapi.daily_limit)}
            />
            <StatCell
              label="Est. today"
              value={String(data.rapidapi.estimated_today)}
            />
          </div>
          <div className="w-full bg-ink-2 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{
                width: `${Math.min(100, (data.rapidapi.estimated_today / data.rapidapi.daily_limit) * 100)}%`,
              }}
            />
          </div>
          <Mono className="text-[9px] text-ink-3 block">
            Each watch-list item ≈ 1–2 API calls. No programmatic usage API —
            check dashboard for exact numbers.
          </Mono>
          <a
            href="https://rapidapi.com/developer/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] text-accent hover:text-accent/80 transition-colors"
          >
            CHECK USAGE ON RAPIDAPI →
          </a>
        </div>

        {/* SECTION 4 — Internal Mycelium API calls */}
        <div className="rounded-md bg-ink-1 p-5 flex flex-col gap-4">
          <Mono className="text-[11px] text-ink-3 tracking-[0.18em]">
            INTERNAL MYCELIUM USAGE
          </Mono>
          <Mono className="text-[9px] text-ink-3 block">
            Estimated Anthropic token spend by feature this month
          </Mono>
          <table className="w-full text-[10px] font-[family-name:var(--font-mono)]">
            <thead>
              <tr className="text-ink-3 text-left">
                <th className="pb-1 font-normal">Feature</th>
                <th className="pb-1 font-normal text-right">Calls</th>
                <th className="pb-1 font-normal text-right">Est. tokens</th>
                <th className="pb-1 font-normal text-right">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {internalRows.map((r) => (
                <tr
                  key={r.feature}
                  className="text-text-1 border-t border-ink-2"
                >
                  <td className="py-1">{r.feature}</td>
                  <td className="py-1 text-right">{r.calls}</td>
                  <td className="py-1 text-right">{formatTokens(r.tokens)}</td>
                  <td className="py-1 text-right">{usd(r.cost_usd)}</td>
                </tr>
              ))}
              <tr className="text-text-0 border-t border-ink-3 font-medium">
                <td className="py-1">Total</td>
                <td className="py-1 text-right">
                  {internalRows.reduce((s, r) => s + r.calls, 0)}
                </td>
                <td className="py-1 text-right">
                  {formatTokens(data.internal.total_est_tokens)}
                </td>
                <td className="py-1 text-right">
                  {usd(data.internal.total_est_cost_usd)}
                </td>
              </tr>
            </tbody>
          </table>

          {data.internal.agent_breakdown.length > 0 && (
            <div>
              <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-2 block">
                AGENT MESSAGE BREAKDOWN
              </Mono>
              <div className="flex flex-col gap-1">
                {data.internal.agent_breakdown.map((a) => (
                  <div
                    key={a.agent_id}
                    className="flex justify-between text-[10px] font-[family-name:var(--font-mono)] text-text-1"
                  >
                    <span className="capitalize">
                      {a.agent_id.replace(/-/g, " ")}
                    </span>
                    <span>
                      {a.count} message{a.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CostCell({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: string;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <Mono className="text-[9px] text-ink-3 tracking-[0.12em]">
        {label}
      </Mono>
      <span
        className={`text-lg font-[family-name:var(--font-display)] ${highlight ? "text-accent" : "text-text-0"}`}
      >
        {value}
      </span>
      {note && (
        <Mono className="text-[8px] text-ink-3">{note}</Mono>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <Mono className="text-[9px] text-ink-3 tracking-[0.12em]">
        {label}
      </Mono>
      <span className="text-sm text-text-0">{value}</span>
    </div>
  );
}

function UnavailableCard({
  message,
  hint,
  href,
}: {
  message: string;
  hint: string;
  href: string;
}) {
  return (
    <div className="rounded-md bg-ink-0 border border-ink-2 p-4 flex flex-col gap-2">
      <div className="text-xs text-text-1 italic font-[family-name:var(--font-display)]">
        {message}
      </div>
      <div className="text-[10px] text-ink-3 font-[family-name:var(--font-display)]">
        {hint}
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] text-accent hover:text-accent/80 transition-colors mt-1"
      >
        VIEW USAGE →
      </a>
    </div>
  );
}
