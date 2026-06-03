import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchTransactions, normalizeApiTransactions } from "@/lib/finance/paypal-api";
import { classifyPayPalRows } from "@/lib/finance/paypal-csv";
import { persistPayPalImport } from "@/lib/finance/paypal-persist";
import { runPayPalMatcher } from "@/lib/finance/paypal-match";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_DAYS = 35;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function runSync(req: NextRequest): Promise<NextResponse> {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || DEFAULT_DAYS, 1), 90);

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const apiTxns = await fetchTransactions(startDate, endDate);
    const rows = normalizeApiTransactions(apiTxns);

    const classified = await classifyPayPalRows(rows);
    const importResult = { ...classified, errors: [] as { line: number; raw: string; reason: string }[] };

    const supabase = createServerClient();
    const persisted = await persistPayPalImport(supabase, uid, importResult);

    const matchResult = await runPayPalMatcher(supabase, uid);

    return NextResponse.json({
      fetched: apiTxns.length,
      imported: persisted.imported,
      skipped: persisted.skipped,
      pending: matchResult.pending,
      matched: matchResult.auto_matched,
      errors: persisted.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PayPal sync]", message);

    if (message.includes("PERMISSION_DENIED") || message.includes("INVALID_REQUEST")) {
      return NextResponse.json({
        error: "PayPal API transient error",
        detail: message,
        fetched: 0,
        imported: 0,
        skipped: 0,
        pending: 0,
        matched: 0,
      });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runSync(req);
}

export async function POST(req: NextRequest) {
  return runSync(req);
}
