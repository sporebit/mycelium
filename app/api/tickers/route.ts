import { NextResponse } from "next/server";

export const runtime = "nodejs";

export type TickerItem = {
  symbol: string;
  price: number;
  // Optional — fuel rotation items don't have a day-over-day delta yet.
  change_pct?: number;
};

export type TickerCategory = "crypto" | "stocks" | "commodities";

export type TickersResponse = {
  crypto: TickerItem[];
  stocks: TickerItem[];
  commodities: TickerItem[];
  failed: Array<{ category: TickerCategory; symbol: string }>;
};

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5000;

let cache: { data: TickersResponse; expiresAt: number } | null = null;

const CRYPTO_SYMBOLS: Array<{ symbol: string; cgId: string }> = [
  { symbol: "BTC", cgId: "bitcoin" },
  { symbol: "ETH", cgId: "ethereum" },
  { symbol: "USDT", cgId: "tether" },
];

const STOCKS_SYMBOLS: Array<{ symbol: string; yahoo: string }> = [
  { symbol: "NDX", yahoo: "^NDX" },
  { symbol: "SPX", yahoo: "^GSPC" },
];

const COMMODITIES_SYMBOLS: Array<{ symbol: string; yahoo: string }> = [
  { symbol: "GOLD", yahoo: "GC=F" },
  { symbol: "SILVER", yahoo: "SI=F" },
  { symbol: "COPPER", yahoo: "HG=F" },
  { symbol: "PALLADIUM", yahoo: "PA=F" },
  { symbol: "OIL", yahoo: "BZ=F" },
];

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

async function fetchCryptoBatch(): Promise<{
  items: TickerItem[];
  failed: string[];
}> {
  const ids = CRYPTO_SYMBOLS.map((c) => c.cgId).join(",");
  try {
    const res = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) {
      return { items: [], failed: CRYPTO_SYMBOLS.map((c) => c.symbol) };
    }
    const j = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >;
    const items: TickerItem[] = [];
    const failed: string[] = [];
    for (const c of CRYPTO_SYMBOLS) {
      const row = j[c.cgId];
      if (typeof row?.usd === "number") {
        items.push({
          symbol: c.symbol,
          price: row.usd,
          change_pct:
            typeof row.usd_24h_change === "number" ? row.usd_24h_change : 0,
        });
      } else {
        failed.push(c.symbol);
      }
    }
    return { items, failed };
  } catch {
    return { items: [], failed: CRYPTO_SYMBOLS.map((c) => c.symbol) };
  }
}

type YahooMeta = { regularMarketPrice?: number; chartPreviousClose?: number };

async function fetchYahooSymbol(
  symbol: string
): Promise<{ price: number; change_pct: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mycelium/1.0",
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
    return { price, change_pct: ((price - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

async function fetchYahooBatch(
  group: Array<{ symbol: string; yahoo: string }>
): Promise<{ items: TickerItem[]; failed: string[] }> {
  const results = await Promise.allSettled(
    group.map((g) => fetchYahooSymbol(g.yahoo))
  );
  const items: TickerItem[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      items.push({
        symbol: group[i].symbol,
        price: r.value.price,
        change_pct: r.value.change_pct,
      });
    } else {
      failed.push(group[i].symbol);
    }
  });
  return { items, failed };
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.data, {
      headers: { "cache-control": "no-store" },
    });
  }

  const [cryptoRes, stocksRes, commoditiesRes] = await Promise.all([
    fetchCryptoBatch(),
    fetchYahooBatch(STOCKS_SYMBOLS),
    fetchYahooBatch(COMMODITIES_SYMBOLS),
  ]);

  const failed: TickersResponse["failed"] = [
    ...cryptoRes.failed.map((s) => ({ category: "crypto" as const, symbol: s })),
    ...stocksRes.failed.map((s) => ({ category: "stocks" as const, symbol: s })),
    ...commoditiesRes.failed.map((s) => ({
      category: "commodities" as const,
      symbol: s,
    })),
  ];

  const data: TickersResponse = {
    crypto: cryptoRes.items,
    stocks: stocksRes.items,
    commodities: commoditiesRes.items,
    failed,
  };

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return NextResponse.json(data, {
    headers: { "cache-control": "no-store" },
  });
}
