import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchFinanceSheet, FinanceNotConfiguredError } from "@/lib/finance/fetchSheet";
import { extractSnapshot } from "@/lib/finance/extractSnapshot";
import {
  getLatestSnapshot,
  persistSnapshot,
} from "@/lib/finance/persistSnapshot";
import type { FinanceData } from "@/lib/finance/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MANUAL_RATE_LIMIT_MS = 60_000;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function notConfigured() {
  return NextResponse.json(
    { error: "Finance not configured" },
    { status: 503 }
  );
}

function isCronRequest(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  return !!(auth && cronSecret && auth === `Bearer ${cronSecret}`);
}

async function runRefresh(source: "manual" | "cron") {
  try {
    const uid = userId();
    if (!uid) {
      return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
    }

    const supabase = createServerClient();

    // Rate limit manual refreshes
    if (source === "manual") {
      const latest = await getLatestSnapshot(supabase, uid);
      if (latest) {
        const age = Date.now() - new Date(latest.last_refreshed_at).getTime();
        if (age < MANUAL_RATE_LIMIT_MS) {
          const retryAfter = Math.ceil((MANUAL_RATE_LIMIT_MS - age) / 1000);
          return NextResponse.json(
            {
              snapshot: latest.snapshot,
              last_refreshed_at: latest.last_refreshed_at,
              source: latest.source,
              rate_limited: true,
              retry_after_s: retryAfter,
            },
            { status: 429 }
          );
        }
      }
    }

    const sheets = await fetchFinanceSheet({ force: true });
    const snapshot = await extractSnapshot(sheets);
    if (!snapshot) {
      return NextResponse.json(
        { error: "Snapshot extraction failed" },
        { status: 502 }
      );
    }

    const persisted = await persistSnapshot(supabase, uid, snapshot, source);
    return NextResponse.json(persisted);
  } catch (err) {
    if (err instanceof FinanceNotConfiguredError) return notConfigured();
    console.error("[/api/finance/snapshot] refresh failed:", err);
    return NextResponse.json({ error: "refresh failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_SHEETS_FINANCE_ID) return notConfigured();

  // Vercel cron sends GET with Bearer — trigger refresh on this path.
  if (isCronRequest(req)) {
    return runRefresh("cron");
  }

  // Otherwise: pure read.
  try {
    const uid = userId();
    if (!uid) {
      return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
    }
    const supabase = createServerClient();
    const latest = await getLatestSnapshot(supabase, uid);
    if (!latest) {
      return NextResponse.json({
        snapshot: null,
        last_refreshed_at: null,
        source: null,
      } satisfies {
        snapshot: null;
        last_refreshed_at: null;
        source: null;
      });
    }
    const payload: FinanceData & { date: string } = latest;
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/finance/snapshot GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_SHEETS_FINANCE_ID) return notConfigured();

  let source: "manual" | "cron" = "manual";
  try {
    const body = (await req.json().catch(() => ({}))) as { source?: unknown };
    if (body.source === "cron" && isCronRequest(req)) source = "cron";
  } catch {
    /* no body */
  }
  return runRefresh(source);
}
