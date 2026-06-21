"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";

type Metric = {
  recorded_at: string;
  cpu_usage: number | null;
  gpu_usage: number | null;
  ram_used_gb: number | null;
  ram_total_gb: number | null;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function PCOverviewCard() {
  const [metric, setMetric] = useState<Metric | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/studio/pc-metrics", { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled) setMetric(j.current ?? null);
      } catch { /* noop */ }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const [now, setNow] = useState(() => 0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setNow(Date.now());
    })();
    return () => { cancelled = true; };
  }, [metric]);
  const isOnline =
    metric && now > 0 &&
    now - new Date(metric.recorded_at).getTime() < 120_000;

  if (!loaded) {
    return (
      <CardShell>
        <Mono className="text-[10px] text-ink-3">Loading…</Mono>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <div className="flex items-center justify-between">
        <div className="text-base text-ink-4">PC</div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-ok" : "bg-danger"}`}
          />
          <Mono className="text-[9px] text-ink-3">
            {isOnline ? "ONLINE" : "OFFLINE"}
          </Mono>
        </div>
      </div>
      {metric ? (
        <>
          <div className="flex items-center gap-3 mt-2 text-[11px] font-[family-name:var(--font-mono)]">
            <span className="text-ink-3">
              CPU{" "}
              <span className="text-text-1">
                {metric.cpu_usage !== null
                  ? `${Math.round(Number(metric.cpu_usage))}%`
                  : "—"}
              </span>
            </span>
            <span className="text-ink-3">
              GPU{" "}
              <span className="text-text-1">
                {metric.gpu_usage !== null
                  ? `${Math.round(Number(metric.gpu_usage))}%`
                  : "—"}
              </span>
            </span>
            <span className="text-ink-3">
              RAM{" "}
              <span className="text-text-1">
                {metric.ram_used_gb !== null && metric.ram_total_gb !== null
                  ? `${Number(metric.ram_used_gb).toFixed(0)}/${Number(metric.ram_total_gb).toFixed(0)}GB`
                  : "—"}
              </span>
            </span>
          </div>
          <Mono className="text-[9px] text-ink-3 mt-1">
            Last seen {timeAgo(metric.recorded_at)}
          </Mono>
        </>
      ) : (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
          No data yet. Start the PC Agent.
        </div>
      )}
    </CardShell>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/studio/pc"
      className="block rounded-md bg-ink-1 border border-ink-2 hover:border-ink-3 px-4 py-3 transition-colors"
    >
      {children}
    </Link>
  );
}
