"use client";

import { useLayoutEffect, useRef, useState } from "react";

type Size = "sm" | "md";
type Option = { value: string; label: string };

const SIZE: Record<Size, string> = {
  sm: "text-[11px] px-3 h-7",
  md: "text-xs px-3.5 h-8",
};

export function SegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  size?: Size;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLButtonElement>(
      `button[data-value="${value}"]`,
    );
    if (!active) return;
    const cRect = container.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    setPill({ left: aRect.left - cRect.left, width: aRect.width });
  }, [value, options]);

  function onKey(e: React.KeyboardEvent) {
    const idx = options.findIndex((o) => o.value === value);
    if (idx < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(options[(idx + 1) % options.length].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(options[(idx - 1 + options.length) % options.length].value);
    }
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className="relative inline-flex items-center gap-0.5 bg-surface-1 border border-hairline rounded-v2-md p-0.5"
    >
      {pill && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 rounded-v2-sm bg-surface-3 motion-safe:transition-[left,width] motion-safe:duration-[var(--dur-fast)] motion-safe:[transition-timing-function:var(--ease-out)]"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={opt.value}
            onClick={() => onChange(opt.value)}
            className={`relative z-[1] font-[family-name:var(--font-jetbrains-mono)] tracking-[0.06em] uppercase transition-colors duration-[var(--dur-fast)] [transition-timing-function:var(--ease-out)] ${
              SIZE[size]
            } ${active ? "text-text-hi" : "text-text-lo hover:text-text-mid"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
