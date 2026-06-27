"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import {
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

type Drive = {
  letter: string;
  size_gb: number;
  used_gb: number;
  percent: number;
  type?: string;
};

type Metric = {
  id: string;
  recorded_at: string;
  cpu_usage: number | null;
  cpu_temp: number | null;
  cpu_clock_mhz: number | null;
  gpu_usage: number | null;
  gpu_temp: number | null;
  gpu_vram_used_mb: number | null;
  gpu_vram_total_mb: number | null;
  ram_used_gb: number | null;
  ram_total_gb: number | null;
  network_upload_mbps: number | null;
  network_download_mbps: number | null;
  uptime_seconds: number | null;
  drives: Drive[] | null;
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function tempColour(temp: number | null): string {
  if (temp === null) return "text-ink-3";
  if (temp < 60) return "text-ok";
  if (temp < 80) return "text-warn";
  return "text-danger";
}

function usageColour(pct: number | null): string {
  if (pct === null) return "text-ink-3";
  if (pct < 60) return "text-ok";
  if (pct < 85) return "text-warn";
  return "text-danger";
}

function driveColour(pct: number): string {
  if (pct < 70) return "bg-ok";
  if (pct < 90) return "bg-warn";
  return "bg-danger";
}

function GaugeRing({
  value,
  label,
  sub,
  colour,
}: {
  value: number | null;
  label: string;
  sub?: string;
  colour: string;
}) {
  const pct = value ?? 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--ink-2)"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-500 ${colour}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: 100, height: 100 }}>
        <span className={`text-xl font-[family-name:var(--font-display)] ${colour}`}>
          {value !== null ? `${Math.round(value)}%` : "—"}
        </span>
      </div>
      <Mono className="text-[10px] text-ink-3 mt-1">{label}</Mono>
      {sub && <Mono className="text-[10px] text-ink-3">{sub}</Mono>}
    </div>
  );
}

export default function PCDashboardPage() {
  const [current, setCurrent] = useState<Metric | null>(null);
  const [history, setHistory] = useState<Metric[]>([]);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastUpdate = useRef<number>(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/studio/pc-metrics", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setCurrent(j.current ?? null);
      setHistory(j.history ?? []);
      if (j.current) lastUpdate.current = new Date(j.current.recorded_at).getTime();
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    const interval = setInterval(() => {
      if (!cancelled) void load();
    }, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdate.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const isOffline = !current || secondsAgo > 120;

  const chartData = [...history].reverse().map((m) => ({
    cpu: Number(m.cpu_usage) || 0,
    gpu: Number(m.gpu_usage) || 0,
    ram: m.ram_total_gb ? (Number(m.ram_used_gb) / Number(m.ram_total_gb)) * 100 : 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            PC Dashboard
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Real-time hardware monitoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isOffline ? "bg-danger" : "bg-ok"}`}
          />
          <Mono className="text-[10px] text-ink-3">
            {isOffline ? "OFFLINE" : "ONLINE"}
          </Mono>
        </div>
      </header>

      {isOffline && !current && (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          No metrics received yet. Start the Myphelium2 PC Agent on your machine.
        </div>
      )}

      {current && (
        <>
          {/* Row 1: Current snapshot */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-md bg-ink-1 p-4 flex flex-col items-center relative">
              <GaugeRing
                value={current.cpu_usage !== null ? Number(current.cpu_usage) : null}
                label="CPU"
                sub={current.cpu_temp !== null ? `${Math.round(Number(current.cpu_temp))}°C` : undefined}
                colour={usageColour(current.cpu_usage !== null ? Number(current.cpu_usage) : null)}
              />
              {current.cpu_temp !== null && (
                <Mono className={`text-[10px] mt-0.5 ${tempColour(Number(current.cpu_temp))}`}>
                  {Math.round(Number(current.cpu_temp))}°C
                </Mono>
              )}
            </div>

            <div className="rounded-md bg-ink-1 p-4 flex flex-col items-center relative">
              <GaugeRing
                value={current.gpu_usage !== null ? Number(current.gpu_usage) : null}
                label="GPU"
                sub={current.gpu_temp !== null ? `${Math.round(Number(current.gpu_temp))}°C` : undefined}
                colour={usageColour(current.gpu_usage !== null ? Number(current.gpu_usage) : null)}
              />
              {current.gpu_temp !== null && (
                <Mono className={`text-[10px] mt-0.5 ${tempColour(Number(current.gpu_temp))}`}>
                  {Math.round(Number(current.gpu_temp))}°C
                </Mono>
              )}
            </div>

            <div className="rounded-md bg-ink-1 p-4 flex flex-col items-center justify-center gap-2">
              <Mono className="text-[10px] text-ink-3">RAM</Mono>
              <div className="text-xl font-[family-name:var(--font-display)] text-text-0">
                {current.ram_used_gb !== null
                  ? `${Number(current.ram_used_gb).toFixed(1)}`
                  : "—"}
                <span className="text-sm text-ink-3">
                  /{current.ram_total_gb !== null ? `${Number(current.ram_total_gb).toFixed(0)}` : "—"} GB
                </span>
              </div>
              {current.ram_total_gb && current.ram_used_gb && (
                <div className="w-full h-1.5 bg-ink-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      Number(current.ram_used_gb) / Number(current.ram_total_gb) > 0.85
                        ? "bg-danger"
                        : Number(current.ram_used_gb) / Number(current.ram_total_gb) > 0.6
                          ? "bg-warn"
                          : "bg-ok"
                    }`}
                    style={{
                      width: `${(Number(current.ram_used_gb) / Number(current.ram_total_gb)) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>

            <div className="rounded-md bg-ink-1 p-4 flex flex-col items-center justify-center gap-2">
              <Mono className="text-[10px] text-ink-3">NETWORK</Mono>
              <div className="flex items-center gap-3 text-sm font-[family-name:var(--font-display)]">
                <span className="text-ok">
                  ↑ {current.network_upload_mbps !== null ? Number(current.network_upload_mbps).toFixed(1) : "—"}
                </span>
                <span className="text-info">
                  ↓ {current.network_download_mbps !== null ? Number(current.network_download_mbps).toFixed(1) : "—"}
                </span>
              </div>
              <Mono className="text-[9px] text-ink-3">Mbps</Mono>
            </div>
          </div>

          {/* Row 2: Sparklines */}
          {chartData.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: "cpu" as const, label: "CPU USAGE", colour: "#84f5b8" },
                { key: "gpu" as const, label: "GPU USAGE", colour: "#6db8f5" },
                { key: "ram" as const, label: "RAM USAGE", colour: "#f5b56d" },
              ].map(({ key, label, colour }) => (
                <div key={key} className="rounded-md bg-ink-1 p-3">
                  <Mono className="text-[10px] text-ink-3 mb-2">{label}</Mono>
                  <ResponsiveContainer width="100%" height={60}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={colour} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={colour} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey={key}
                        stroke={colour}
                        strokeWidth={1.5}
                        fill={`url(#grad-${key})`}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}

          {/* Row 3: Drives */}
          {current.drives && (current.drives as Drive[]).length > 0 && (
            <div>
              <Mono className="text-[10px] text-ink-3 mb-2">DRIVES</Mono>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(current.drives as Drive[]).map((drive) => (
                  <div
                    key={drive.letter}
                    className="rounded-md bg-ink-1 p-3 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <Mono className="text-xs text-text-0">{drive.letter}</Mono>
                      <Mono className="text-[10px] text-ink-3">
                        {drive.used_gb.toFixed(0)}/{drive.size_gb.toFixed(0)} GB
                      </Mono>
                    </div>
                    <div className="h-1.5 bg-ink-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${driveColour(drive.percent)}`}
                        style={{ width: `${Math.min(drive.percent, 100)}%` }}
                      />
                    </div>
                    <Mono className="text-[9px] text-ink-3">
                      {(drive.size_gb - drive.used_gb).toFixed(0)} GB free ({(100 - drive.percent).toFixed(0)}%)
                    </Mono>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 4: System info */}
          <div className="flex flex-wrap gap-4">
            {current.uptime_seconds != null && (
              <div className="rounded-md bg-ink-1 px-4 py-3">
                <Mono className="text-[10px] text-ink-3 mb-1">UPTIME</Mono>
                <div className="text-sm text-text-0 font-[family-name:var(--font-display)]">
                  {formatUptime(Number(current.uptime_seconds))}
                </div>
              </div>
            )}
            <div className="rounded-md bg-ink-1 px-4 py-3">
              <Mono className="text-[10px] text-ink-3 mb-1">LAST UPDATED</Mono>
              <div className="text-sm text-text-0 font-[family-name:var(--font-display)]">
                {secondsAgo < 5
                  ? "just now"
                  : secondsAgo < 60
                    ? `${secondsAgo}s ago`
                    : `${Math.floor(secondsAgo / 60)}m ${secondsAgo % 60}s ago`}
              </div>
            </div>
            {current.gpu_vram_used_mb != null && current.gpu_vram_total_mb != null && (
              <div className="rounded-md bg-ink-1 px-4 py-3">
                <Mono className="text-[10px] text-ink-3 mb-1">GPU VRAM</Mono>
                <div className="text-sm text-text-0 font-[family-name:var(--font-display)]">
                  {(Number(current.gpu_vram_used_mb) / 1024).toFixed(1)}/
                  {(Number(current.gpu_vram_total_mb) / 1024).toFixed(1)} GB
                </div>
              </div>
            )}
            {current.cpu_clock_mhz != null && (
              <div className="rounded-md bg-ink-1 px-4 py-3">
                <Mono className="text-[10px] text-ink-3 mb-1">CPU CLOCK</Mono>
                <div className="text-sm text-text-0 font-[family-name:var(--font-display)]">
                  {(Number(current.cpu_clock_mhz) / 1000).toFixed(2)} GHz
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
