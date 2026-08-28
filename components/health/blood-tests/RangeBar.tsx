"use client";

import { statusColour } from "@/lib/health/blood-markers";

export function RangeBar({
  value,
  min,
  max,
  status,
}: {
  value: number | null;
  min: number;
  max: number;
  status: "normal" | "abnormal" | "unquantified";
}) {
  if (value === null) {
    return (
      <div
        className="rounded-full bg-hairline"
        style={{ width: 120, height: 4 }}
      />
    );
  }

  const range = max - min;
  const padding = range * 0.2;
  const trackMin = min - padding;
  const trackMax = max + padding;
  const trackRange = trackMax - trackMin;

  const refStart = ((min - trackMin) / trackRange) * 100;
  const refWidth = ((max - min) / trackRange) * 100;
  let dotPos = ((value - trackMin) / trackRange) * 100;
  dotPos = Math.max(2, Math.min(98, dotPos));

  return (
    <div
      className="relative"
      style={{ width: 120, height: 12 }}
      title={`${value} (range: ${min}–${max})`}
    >
      {/* Track */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full bg-hairline"
        style={{ left: 0, right: 0, height: 4 }}
      />
      {/* Reference range (green zone) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${refStart}%`,
          width: `${refWidth}%`,
          height: 4,
          // Wash, not a saturated fill — the reference band should recede
          // behind the marker dot rather than compete with it.
          backgroundColor: "var(--glow-wash, rgba(132, 245, 184, 0.07))",
        }}
      />
      {/* Value dot */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${dotPos}%`,
          width: 8,
          height: 8,
          marginLeft: -4,
          backgroundColor: statusColour(status),
          boxShadow: "0 0 0 2px var(--surface-1, transparent)",
        }}
      />
    </div>
  );
}
