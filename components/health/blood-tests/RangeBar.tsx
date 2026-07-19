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
        className="rounded-full bg-ink-2/50"
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
        className="absolute top-1/2 -translate-y-1/2 rounded-full bg-ink-2/40"
        style={{ left: 0, right: 0, height: 4 }}
      />
      {/* Reference range (green zone) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${refStart}%`,
          width: `${refWidth}%`,
          height: 4,
          backgroundColor: "rgba(74, 222, 128, 0.25)",
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
        }}
      />
    </div>
  );
}
