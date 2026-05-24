"use client";

import { useEffect, useState } from "react";

type SunData = {
  sunrise: string;
  sunset: string;
  tomorrow_sunrise: string;
};

const REFRESH_MS = 30 * 60 * 1000; // refetch the day's data every 30 min

function fmtHHMM(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function computeNext(
  now: Date,
  data: SunData
): { kind: "sunrise" | "sunset"; at: Date } {
  const sr = new Date(data.sunrise);
  const ss = new Date(data.sunset);
  const tomSr = new Date(data.tomorrow_sunrise);
  if (now < sr) return { kind: "sunrise", at: sr };
  if (now < ss) return { kind: "sunset", at: ss };
  return { kind: "sunrise", at: tomSr };
}

export function SunWidget() {
  const [data, setData] = useState<SunData | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/sun", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const j = (await res.json()) as Partial<SunData>;
        if (
          mounted &&
          typeof j.sunrise === "string" &&
          typeof j.sunset === "string" &&
          typeof j.tomorrow_sunrise === "string"
        ) {
          setData({
            sunrise: j.sunrise,
            sunset: j.sunset,
            tomorrow_sunrise: j.tomorrow_sunrise,
          });
        }
      } catch {
        /* keep prior data */
      }
    }
    void load();
    const fetchTimer = setInterval(load, REFRESH_MS);
    const tickTimer = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      mounted = false;
      clearInterval(fetchTimer);
      clearInterval(tickTimer);
    };
  }, []);

  if (!data) {
    return <div className="hidden lg:block w-[60px]" aria-hidden />;
  }

  const next = computeNext(now, data);
  const arrow = next.kind === "sunrise" ? "↑" : "↓";

  return (
    <div
      className="hidden lg:flex items-center gap-1 text-[11px] font-[family-name:var(--font-mono)] text-ink-3 tabular-nums"
      title={`Next ${next.kind}`}
    >
      <span aria-hidden>{arrow}</span>
      <span>{fmtHHMM(next.at)}</span>
    </div>
  );
}
