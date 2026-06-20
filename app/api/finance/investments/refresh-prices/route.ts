import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Investment = {
  id: string;
  ticker: string | null;
  category: string;
};

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    return meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

async function fetchCoinGeckoPrice(ticker: string): Promise<number | null> {
  try {
    const id = ticker.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=gbp`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.[id]?.gbp ?? null;
  } catch {
    return null;
  }
}

async function lookupPrice(inv: Investment): Promise<number | null> {
  if (!inv.ticker) return null;
  if (inv.category === "crypto") {
    return fetchCoinGeckoPrice(inv.ticker);
  }
  if (["stock", "etf", "commodity"].includes(inv.category)) {
    return fetchYahooPrice(inv.ticker);
  }
  return null;
}

export async function POST() {
  try {
    const supabase = createServerClient();
    const { data: investments, error } = await supabase
      .from("investments")
      .select("id, ticker, category")
      .eq("sold", false)
      .not("ticker", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results: { id: string; price: number | null }[] = [];
    const now = new Date().toISOString();

    const batches: Investment[][] = [];
    for (let i = 0; i < (investments as Investment[]).length; i += 5) {
      batches.push((investments as Investment[]).slice(i, i + 5));
    }

    for (const batch of batches) {
      const prices = await Promise.all(batch.map((inv) => lookupPrice(inv)));
      for (let i = 0; i < batch.length; i++) {
        const price = prices[i];
        results.push({ id: batch[i].id, price });
        if (price !== null) {
          await supabase
            .from("investments")
            .update({ current_price: price, current_price_updated_at: now })
            .eq("id", batch[i].id);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      updated: results.filter((r) => r.price !== null).length,
      failed: results.filter((r) => r.price === null).length,
    });
  } catch (err) {
    console.error("[investments/refresh-prices POST]", err);
    return NextResponse.json({ error: "refresh failed" }, { status: 500 });
  }
}
