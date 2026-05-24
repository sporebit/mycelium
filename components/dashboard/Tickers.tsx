"use client";

import { useEffect, useMemo, useState } from "react";
import { RotatingTicker } from "./RotatingTicker";
import type { TickerItem, TickersResponse } from "@/app/api/tickers/route";
import type { FuelApiResponse } from "@/lib/fuel/types";

const MARKETS_REFRESH_MS = 60_000;
const FUEL_REFRESH_MS = 30 * 60_000;

export function Tickers() {
  const [markets, setMarkets] = useState<TickersResponse | null>(null);
  const [fuel, setFuel] = useState<FuelApiResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/tickers", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const j = (await res.json()) as TickersResponse;
        if (!mounted) return;
        setMarkets(j);
      } catch {
        /* keep prior data */
      }
    }
    void load();
    const id = setInterval(load, MARKETS_REFRESH_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/fuel", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const j = (await res.json()) as FuelApiResponse;
        if (!mounted) return;
        setFuel(j);
      } catch {
        /* keep prior data */
      }
    }
    void load();
    const id = setInterval(load, FUEL_REFRESH_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const fuelItems: TickerItem[] = useMemo(() => {
    if (!fuel) return [];
    const out: TickerItem[] = [];
    if (fuel.summary.avgE10 !== null) {
      out.push({ symbol: "E10", price: fuel.summary.avgE10 });
    }
    if (fuel.summary.avgB7 !== null) {
      out.push({ symbol: "B7", price: fuel.summary.avgB7 });
    }
    return out;
  }, [fuel]);

  // Reserve the row height while either source is still loading so the rail
  // doesn't reflow when data arrives.
  if (!markets) {
    return <div className="hidden sm:flex items-center gap-4 h-[40px]" />;
  }

  return (
    <div className="hidden sm:flex items-center gap-4">
      <RotatingTicker category="CRYPTO" items={markets.crypto} />
      <RotatingTicker category="STOCKS" items={markets.stocks} />
      <div className="hidden lg:flex">
        <RotatingTicker category="COMMODITIES" items={markets.commodities} />
      </div>
      <div className="hidden lg:flex">
        <RotatingTicker category="FUEL" items={fuelItems} />
      </div>
    </div>
  );
}
