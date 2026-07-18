"use client";

import { useEffect, useState } from "react";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import type { CardWidth } from "@/lib/dashboard/card-registry";

type Collection = {
  date: string;
  type: "recycling" | "black";
  gardenIncluded: boolean;
};

type BinsResponse = {
  next: Collection;
  upcoming: Collection[];
};

function formatDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const wk = d.toLocaleDateString("en-GB", { weekday: "short" });
  const dd = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${wk.toUpperCase()} ${dd.toUpperCase()}`;
}

function daysUntil(iso: string): string {
  const target = new Date(iso + "T00:00:00").getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((target - today) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 0) return "past";
  return `in ${diff}d`;
}

function typeStyle(c: Collection): { swatch: string; label: string; text: string } {
  if (c.type === "black") {
    return { swatch: "bg-ink-4", label: "Black bin", text: "text-ink-4" };
  }
  if (c.gardenIncluded) {
    return { swatch: "bg-glow-1", label: "Recycling + garden", text: "text-glow-1" };
  }
  return { swatch: "bg-glow-2", label: "Recycling", text: "text-glow-2" };
}

function TypeIcon({ c }: { c: Collection }) {
  const s = typeStyle(c);
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.swatch}`} aria-hidden />
      <span className={`text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] ${s.text}`}>
        {s.label}
      </span>
    </span>
  );
}

export function Bins({ width = 1 }: { width?: CardWidth } = {}) {
  const [data, setData] = useState<BinsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/bins/next", { cache: "no-store" });
        if (!mounted) return;
        if (!res.ok) {
          setError(res.status === 404 ? "Not configured" : `Load failed (${res.status})`);
          return;
        }
        setData((await res.json()) as BinsResponse);
      } catch {
        if (mounted) setError("Network error");
      }
    }
    void load();
  }, []);

  return (
    <Panel borderless title="BINS" topRight={<Mono>WED PICKUP</Mono>}>
      {error && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {!data && !error && (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3">
          Loading…
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Next collection
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <Mono className="text-xl text-ink-4">{formatDay(data.next.date)}</Mono>
              <Mono className="text-[11px] text-ink-3">{daysUntil(data.next.date)}</Mono>
            </div>
            <div className="mt-2">
              <TypeIcon c={data.next} />
            </div>
            {data.next.type === "recycling" && !data.next.gardenIncluded && (
              <div className="mt-1 text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.12em]">
                garden waste: out of season
              </div>
            )}
          </div>

          {width >= 2 && data.upcoming.length > 1 && (
            <ul className="flex flex-col divide-y divide-ink-2 pt-2 border-t border-ink-2">
              {data.upcoming.slice(1).map((c) => (
                <li key={c.date} className="flex items-center justify-between gap-2 py-1.5">
                  <Mono className="text-[11px] text-ink-3 w-24">{formatDay(c.date)}</Mono>
                  <TypeIcon c={c} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
