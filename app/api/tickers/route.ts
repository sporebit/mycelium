import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TickerPoint = { price: number; change_24h_pct: number };
type TickersResponse = {
  btc?: TickerPoint;
  spx?: TickerPoint;
  gold?: TickerPoint;
  failed: string[];
};

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5000;

let cache: { data: TickersResponse; expiresAt: number } | null = null;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchBTC(): Promise<TickerPoint | null> {
  try {
    const res = await fetchWithTimeout(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      bitcoin?: { usd?: number; usd_24h_change?: number };
    };
    const price = j.bitcoin?.usd;
    if (typeof price !== "number") return null;
    return {
      price,
      change_24h_pct:
        typeof j.bitcoin?.usd_24h_change === "number"
          ? j.bitcoin.usd_24h_change
          : 0,
    };
  } catch {
    return null;
  }
}

type YahooMeta = { regularMarketPrice?: number; chartPreviousClose?: number };

async function fetchYahoo(symbol: string): Promise<TickerPoint | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MyceliumOS/1.0; +https://mycelium.local)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      chart?: { result?: Array<{ meta?: YahooMeta }> };
    };
    const meta = j.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const prev = meta?.chartPreviousClose;
    if (typeof price !== "number" || typeof prev !== "number" || prev === 0) {
      return null;
    }
    return {
      price,
      change_24h_pct: ((price - prev) / prev) * 100,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.data, {
      headers: { "cache-control": "no-store" },
    });
  }

  const [btc, spx, gold] = await Promise.all([
    fetchBTC(),
    fetchYahoo("^GSPC"),
    fetchYahoo("GC=F"),
  ]);

  const failed: string[] = [];
  if (!btc) failed.push("btc");
  if (!spx) failed.push("spx");
  if (!gold) failed.push("gold");

  const data: TickersResponse = { failed };
  if (btc) data.btc = btc;
  if (spx) data.spx = spx;
  if (gold) data.gold = gold;

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return NextResponse.json(data, {
    headers: { "cache-control": "no-store" },
  });
}
