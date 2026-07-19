"use client";

import { LiveClock } from "../LiveClock";
import { SunWidget } from "../SunWidget";
import { Surface } from "@/components/ui";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good evening";
}

function todayLine(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function TodayHeader() {
  return (
    <Surface level={0} border={false} radius={false} className="mb-5">
      <h1 className="text-2xl font-semibold text-text-hi tracking-[-0.02em] leading-[1.15]">
        {greeting()}
      </h1>
      <div className="mt-1 text-sm text-text-mid font-[family-name:var(--font-inter-tight)]">
        {todayLine()}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] font-[family-name:var(--font-jetbrains-mono)] text-text-lo">
        <LiveClock />
        <SunWidget />
      </div>
    </Surface>
  );
}
