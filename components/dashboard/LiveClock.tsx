"use client";

import { useEffect, useState } from "react";

type Format = "time" | "date" | "datetime";

function format(d: Date, mode: Format): string {
  if (mode === "time") {
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  if (mode === "date") {
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return d.toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function LiveClock({
  format: mode = "time",
  className = "",
  intervalMs = 1000,
}: {
  format?: Format;
  className?: string;
  intervalMs?: number;
}) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <span
      suppressHydrationWarning
      className={`font-[family-name:var(--font-mono)] tabular-nums ${className}`}
    >
      {format(now, mode)}
    </span>
  );
}
