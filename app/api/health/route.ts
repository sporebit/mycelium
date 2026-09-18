import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/health — the smoke check the Vercel deployment webhook runs
 * before it moves a Verify ticket to Done (tickets spec §7.1). Public,
 * unauthenticated, no database: it answers "the deployed build serves"
 * and names the commit so the evidence link is self-describing.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    env: process.env.VERCEL_ENV ?? "local",
  });
}
