"use client";

import { useEffect, useState } from "react";
import { RotatingTicker } from "./RotatingTicker";
import type { TickersResponse } from "@/app/api/tickers/route";

const REFRESH_MS = 60_000;

export function Tickers() {
  const [data, setData] = useState<TickersResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/tickers", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const j = (await res.json()) as TickersResponse;
        if (!mounted) return;
        setData(j);
      } catch {
        /* keep prior data */
      }
    }
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // While loading: reserve the row height with an empty placeholder so the
  // top rail doesn't visibly reflow when data arrives.
  if (!data) {
    return <div className="hidden sm:flex items-center gap-4 h-[40px]" />;
  }

  return (
    <div className="hidden sm:flex items-center gap-4">
      <RotatingTicker category="CRYPTO" items={data.crypto} />
      <RotatingTicker category="STOCKS" items={data.stocks} />
      <div className="hidden md:flex">
        <RotatingTicker
          category="COMMODITIES"
          items={data.commodities}
        />
      </div>
    </div>
  );
}
