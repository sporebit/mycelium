import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/user";
import { PRINCIPAL_HEADER, PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { withUser } from "@/lib/system/withUser";
import { getOwnProfile } from "@/lib/auth/session";
import { boundUser } from "@/lib/system/bindings";
import { fetchTransactions, normalizeApiTransactions } from "@/lib/finance/paypal-api";
import { classifyPayPalRows } from "@/lib/finance/paypal-csv";
import { persistPayPalImport } from "@/lib/finance/paypal-persist";
import { runPayPalMatcher } from "@/lib/finance/paypal-match";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_DAYS = 35;

/**
 * The Vercel cron reaches this route with CRON_SECRET, which the middleware
 * admits as the system principal with no user. That call has no session to
 * scope RLS by, so it runs as the cron's bound user; every other caller (the
 * finance page, API_SECRET) goes through the request-path client as normal.
 */
class NotAllowed extends Error {}

/**
 * PayPal credentials are instance configuration (PAYPAL_CLIENT_ID/SECRET —
 * Phil's account). The cron runs as the bound cron user; a session caller
 * must be the instance owner, or any signed-in user could pull Phil's
 * payments into their own space.
 */
async function runAs<T>(fn: (supabase: SupabaseClient) => Promise<T>): Promise<T> {
  const h = await headers();
  const isCron = h.get(PRINCIPAL_HEADER) === "system" && !h.get(PRINCIPAL_USER_HEADER);
  if (isCron) return withUser(boundUser("cron"), fn);
  const profile = await getOwnProfile();
  if (!profile?.is_instance_owner) throw new NotAllowed();
  return fn(await createUserClient());
}

async function runSync(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || DEFAULT_DAYS, 1), 90);

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const apiTxns = await fetchTransactions(startDate, endDate);
    const rows = normalizeApiTransactions(apiTxns);

    const classified = await classifyPayPalRows(rows);
    const importResult = { ...classified, errors: [] as { line: number; raw: string; reason: string }[] };

    const { persisted, matchResult } = await runAs(async (supabase) => {
      const persisted = await persistPayPalImport(supabase, importResult);
      const matchResult = await runPayPalMatcher(supabase);
      return { persisted, matchResult };
    });

    return NextResponse.json({
      fetched: apiTxns.length,
      imported: persisted.imported,
      skipped: persisted.skipped,
      pending: matchResult.pending,
      matched: matchResult.auto_matched,
      errors: persisted.errors,
    });
  } catch (err) {
    if (err instanceof NotAllowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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
