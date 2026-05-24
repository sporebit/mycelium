"use client";

import { useEffect, useState } from "react";

type TickerPoint = { price: number; change_24h_pct: number };
type TickersResponse = {
  btc?: TickerPoint;
  spx?: TickerPoint;
  gold?: TickerPoint;
  failed: string[];
};

const REFRESH_MS = 60_000;

function fmtPrice(symbol: "BTC" | "SPX" | "XAU", price: number): string {
  if (symbol === "BTC") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(price);
  }
  if (symbol === "XAU") {
    return `$${Math.round(price).toLocaleString("en-US")}`;
  }
  return Math.round(price).toLocaleString("en-US");
}

function fmtPct(p: number): string {
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return `${sign}${Math.abs(p).toFixed(2)}%`;
}

function Ticker({
  symbol,
  price,
  changePct,
}: {
  symbol: "BTC" | "SPX" | "XAU";
  price: number;
  changePct: number;
}) {
  const tone =
    changePct > 0
      ? "text-ok"
      : changePct < 0
        ? "text-danger"
        : "text-ink-3";
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-[family-name:var(--font-mono)]">
      <span className="text-ink-3">{symbol}</span>
      <span className="text-ink-4 tabular-nums">{fmtPrice(symbol, price)}</span>
      <span className={`${tone} tabular-nums`}>{fmtPct(changePct)}</span>
    </div>
  );
}

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

  if (!data) {
    return <div className="hidden md:flex items-center gap-5 h-[18px]" />;
  }

  return (
    <div className="hidden md:flex items-center gap-5">
      {data.btc && (
        <Ticker
          symbol="BTC"
          price={data.btc.price}
          changePct={data.btc.change_24h_pct}
        />
      )}
      {data.spx && (
        <Ticker
          symbol="SPX"
          price={data.spx.price}
          changePct={data.spx.change_24h_pct}
        />
      )}
      {data.gold && (
        <Ticker
          symbol="XAU"
          price={data.gold.price}
          changePct={data.gold.change_24h_pct}
        />
      )}
    </div>
  );
}
