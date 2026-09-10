import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/user";
import { withUser } from "@/lib/system/withUser";
import { getOwnProfile } from "@/lib/auth/session";
import { boundUser } from "@/lib/system/bindings";
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

async function runRefresh(
  supabase: SupabaseClient,
  source: "manual" | "cron",
) {
  try {
    // Rate limit manual refreshes
    if (source === "manual") {
      const latest = await getLatestSnapshot(supabase);
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

    const persisted = await persistSnapshot(supabase, snapshot, source);
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
    // CRON_SECRET names no user: act as the cron binding from configuration.
    return withUser(boundUser("cron"), (db) => runRefresh(db, "cron"));
  }

  // Otherwise: pure read.
  try {
    const supabase = await createUserClient();
    const latest = await getLatestSnapshot(supabase);
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
  if (isCronRequest(req)) {
    return withUser(boundUser("cron"), (db) => runRefresh(db, source));
  }
  // The sheet is instance configuration (GOOGLE_SHEETS_FINANCE_ID — Phil's);
  // only the instance owner may pull it into their space.
  const profile = await getOwnProfile();
  if (!profile?.is_instance_owner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return runRefresh(await createUserClient(), source);
}
