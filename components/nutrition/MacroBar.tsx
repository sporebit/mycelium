"use client";


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
        {/* Matches <Num/>s tabular treatment deliberately WITHOUT using it:
            Num masks every plain value when financeHidden is set, which would
            blank out calories and macros whenever finance is hidden. */}
        <span className="text-[11px] text-ink-4 font-[family-name:var(--font-jetbrains-mono)] tabular-nums">
          {Math.round(value)}/{target}
          {unit}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-ink-2 overflow-hidden">
        <div
          className={`h-full motion-safe:transition-[width] motion-safe:duration-[var(--dur-base)] motion-safe:[transition-timing-function:var(--ease-out)] ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
