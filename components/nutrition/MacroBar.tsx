"use client";

import { Mono } from "@/components/dashboard/Mono";

export function MacroBar({
  label,
  value,
  target,
  unit = "g",
  tone = "accent",
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
  tone?: "accent" | "ok" | "warn" | "danger";
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const colour =
    tone === "ok"
      ? "bg-ok"
      : tone === "warn"
        ? "bg-warn"
        : tone === "danger"
          ? "bg-danger"
          : "bg-accent";
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {label}
        </span>
        <Mono className="text-[11px] text-ink-4 tabular-nums">
          {Math.round(value)}/{target}
          {unit}
        </Mono>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-ink-2 overflow-hidden">
        <div
          className={`h-full transition-[width] duration-300 ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
