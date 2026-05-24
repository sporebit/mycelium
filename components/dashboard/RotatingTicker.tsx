"use client";

import { useEffect, useState } from "react";
import type { TickerItem } from "@/app/api/tickers/route";

const FULL_NAMES: Record<string, string> = {
  BTC: "Bitcoin / USD",
  ETH: "Ethereum / USD",
  USDT: "Tether / USD",
  NDX: "Nasdaq 100 Index",
  SPX: "S&P 500 Index",
  GOLD: "Gold Futures (GC=F)",
  SILVER: "Silver Futures (SI=F)",
  COPPER: "Copper Futures (HG=F)",
  PALLADIUM: "Palladium Futures (PA=F)",
  OIL: "Brent Crude Oil (BZ=F)",
  E10: "Petrol (E10) — avg within 5 mi of Armthorpe",
  B7: "Diesel (B7) — avg within 5 mi of Armthorpe",
};

function fmtPrice(symbol: string, price: number): string {
  if (symbol === "USDT") return `$${price.toFixed(4)}`;
  if (symbol === "BTC" || symbol === "ETH") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(price);
  }
  if (symbol === "OIL") return `$${price.toFixed(2)}`;
  if (
    symbol === "GOLD" ||
    symbol === "SILVER" ||
    symbol === "COPPER" ||
    symbol === "PALLADIUM"
  ) {
    if (price < 100) return `$${price.toFixed(2)}`;
    return `$${Math.round(price).toLocaleString("en-US")}`;
  }
  if (symbol === "SPX" || symbol === "NDX") {
    return Math.round(price).toLocaleString("en-US");
  }
  if (symbol === "E10" || symbol === "B7") {
    return `${price.toFixed(1)}p`;
  }
  return String(price);
}

function fmtPct(p: number): string {
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return `${sign}${Math.abs(p).toFixed(2)}%`;
}

function initialTabVisible(): boolean {
  return typeof document !== "undefined" ? !document.hidden : true;
}

export function RotatingTicker({
  category,
  items,
  intervalMs = 30_000,
}: {
  category: string;
  items: TickerItem[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tabVisible, setTabVisible] = useState<boolean>(() =>
    initialTabVisible()
  );

  // Track tab visibility so rotation pauses when the user switches away.
  useEffect(() => {
    function onVis() {
      setTabVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const itemCount = items.length;
  const shouldRotate = itemCount > 1 && !paused && tabVisible;

  useEffect(() => {
    if (!shouldRotate) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % itemCount);
    }, intervalMs);
    return () => clearInterval(id);
  }, [shouldRotate, itemCount, intervalMs]);

  const safeIndex = itemCount > 0 ? index % itemCount : 0;
  const current = itemCount > 0 ? items[safeIndex] : null;
  const interactive = itemCount > 1;

  function onClick() {
    if (!interactive) return;
    setPaused((p) => !p);
  }

  const changePct = current?.change_pct;
  const hasChange = typeof changePct === "number";
  const changeTone =
    !hasChange
      ? "text-ink-3"
      : changePct > 0
        ? "text-ok"
        : changePct < 0
          ? "text-danger"
          : "text-ink-3";

  return (
    <button
      type="button"
      onClick={onClick}
      title={current ? FULL_NAMES[current.symbol] ?? current.symbol : category}
      aria-label={
        current
          ? `${FULL_NAMES[current.symbol] ?? current.symbol}, ${fmtPrice(current.symbol, current.price)}${hasChange ? `, ${fmtPct(changePct)}` : ""}${interactive ? (paused ? ", click to resume" : ", click to pause") : ""}`
          : `${category}, no data`
      }
      disabled={!interactive}
      className={`flex flex-col items-start gap-0.5 px-2.5 py-1 rounded-md border text-left min-w-[110px] transition-colors ${
        interactive ? "cursor-pointer" : "cursor-default"
      } ${
        paused
          ? "border-accent/40 bg-accent/5"
          : "border-transparent hover:border-ink-2"
      }`}
    >
      <span className="text-[9px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] leading-none">
        {category}
      </span>
      {current ? (
        <div
          key={current.symbol}
          className="ticker-fade-in flex flex-col gap-0.5 leading-tight"
        >
          <div className="text-[11px] font-[family-name:var(--font-mono)] tabular-nums">
            <span className="text-ink-3">{current.symbol}</span>{" "}
            <span className="text-ink-4">
              {fmtPrice(current.symbol, current.price)}
            </span>
          </div>
          {/* Third line: change pct if known, otherwise a thin spacer so the
              cell height stays consistent across categories. */}
          {hasChange ? (
            <div
              className={`text-[10px] font-[family-name:var(--font-mono)] tabular-nums ${changeTone}`}
            >
              {fmtPct(changePct)}
            </div>
          ) : (
            <div className="text-[10px] leading-none" aria-hidden>
              &nbsp;
            </div>
          )}
        </div>
      ) : (
        <span className="text-[11px] font-[family-name:var(--font-mono)] text-ink-3 leading-tight">
          —
        </span>
      )}
    </button>
  );
}
